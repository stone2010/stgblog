-- ============================================================================
-- STGBLOG v15.0 — 公开用户编号 + 修改用户名
-- 在 Supabase Dashboard → SQL Editor 中以项目所有者身份【整段】执行。
--
-- 【执行前必读】
-- 1. 先备份（Dashboard → Database → Backups）。本脚本幂等，可重复执行。
-- 2. 依赖 v11_security.sql / v12_honors.sql / v13_growth.sql。
--    如果已经执行过 v14_admin_xp.sql，请在本文件【之后】保持 v15 覆盖；
--    如果之后重跑了 v14_admin_xp.sql，记得再跑一次本文件。
-- 3. 编号规则：排除 SYSTEM，Stone 显式为 1，其余按 created_at, id 顺序；
--    新用户从序列取下一个号。SYSTEM 的 user_no 为 NULL。
-- 4. 改名会同步更新 posts/comments/follows/notifications/DM/群聊/点赞/
--    user_growth/sessions 等当前状态表中的用户名文本；历史审计
--    admin_actions/auth_events 保留旧名。
-- 5. E2EE：users.pubkey 的 encPriv 盐包含用户名，改名时必须由客户端用
--    当前密码重新包裹，并把完整 {pub,encPriv} 传给本脚本的 RPC。
-- 6. 执行后前端才会显示 ID / 改名入口；未执行时前端自动降级。
-- 7. 本文件同时把 v14_admin_xp 的超管判定（admin_grant_xp / admin_overview）
--    从用户名 Stone 改为不可变的 user_no=1，并保留 level/total_xp/detail 字段。
-- ============================================================================

BEGIN;

-- ─── 0. 前置校验 ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION '缺少 users 表';
  END IF;
  IF to_regclass('public.sessions') IS NULL THEN
    RAISE EXCEPTION '缺少 sessions 表，请先执行 migrations/v11_security.sql';
  END IF;
  IF to_regclass('public.user_growth') IS NULL THEN
    RAISE EXCEPTION '缺少 user_growth 表，请先执行 migrations/v12_honors.sql';
  END IF;
  IF to_regclass('public.post_likes') IS NULL THEN
    RAISE EXCEPTION '缺少 post_likes 表，请先执行 migrations/v12_honors.sql';
  END IF;
END $$;

-- ─── 1. 列 / 回填 / 序列 ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.user_no_seq START WITH 1;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_no BIGINT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- 对全部非 SYSTEM 用户排名，只写入尚未分配的行：
-- 这样即使脚本执行到一半失败，重跑也不会把已有编号从 1 重新排一遍。
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           ORDER BY (username = 'Stone') DESC, created_at ASC, id ASC
         ) AS rn
    FROM public.users
   WHERE username <> 'SYSTEM'
)
UPDATE public.users u
   SET user_no = r.rn
  FROM ranked r
 WHERE u.id = r.id
   AND u.user_no IS NULL;

-- 重复编号保护（正常不会发生；发生则中止整个事务）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
     WHERE user_no IS NOT NULL
     GROUP BY user_no HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'user_no 回填出现重复，请先检查 users 表';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_user_no
  ON public.users(user_no) WHERE user_no IS NOT NULL;

-- 大小写不敏感的唯一用户名（改名与并发注册的最后一道保险）
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON public.users(lower(username));

-- 对齐序列：有用户时从最大值继续；空库时第一条仍从 1 开始。
DO $$
DECLARE
  v_max BIGINT;
  v_last BIGINT;
  v_called BOOLEAN;
BEGIN
  SELECT COALESCE(max(user_no), 0) INTO v_max FROM public.users;
  SELECT last_value, is_called INTO v_last, v_called FROM public.user_no_seq;
  IF v_max > 0 OR v_called THEN
    PERFORM setval('public.user_no_seq', GREATEST(v_max, v_last), true);
  ELSE
    PERFORM setval('public.user_no_seq', 1, false);
  END IF;
END $$;

ALTER TABLE public.users ALTER COLUMN user_no SET DEFAULT nextval('public.user_no_seq');
ALTER SEQUENCE public.user_no_seq OWNED BY public.users.user_no;

-- 编号永久不可变（只拦 UPDATE，不影响注册 INSERT）
CREATE OR REPLACE FUNCTION public.guard_user_no_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF OLD.user_no IS NOT NULL AND NEW.user_no IS DISTINCT FROM OLD.user_no THEN
    RAISE EXCEPTION '用户编号不可修改';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_guard_user_no ON public.users;
CREATE TRIGGER trg_guard_user_no BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_no_immutable();

-- 保留名：新注册不能占用 SYSTEM / Stone（Stone 本人改名回 Stone 走 UPDATE，不受影响）
CREATE OR REPLACE FUNCTION public.guard_reserved_username()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF lower(NEW.username) IN ('system', 'stone') THEN
    RAISE EXCEPTION '该用户名已被保留';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_guard_reserved_username ON public.users;
CREATE TRIGGER trg_guard_reserved_username BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_username();

REVOKE ALL ON FUNCTION public.guard_user_no_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reserved_username() FROM PUBLIC, anon, authenticated;

-- ─── 2. 公开读权限 ──────────────────────────────────────────────────────────
GRANT SELECT (user_no) ON TABLE public.users TO anon, authenticated;

-- ─── 3. 身份读取：登录/启动对账 ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_identity()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uname TEXT;
  u RECORD;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session');
  END IF;
  SELECT username, user_no, hash_id, bio, is_admin, username_changed_at
    INTO u
    FROM public.users
   WHERE username = v_uname;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'username', u.username,
    'user_no', u.user_no,
    'hash_id', u.hash_id,
    'bio', u.bio,
    'is_admin', COALESCE(u.is_admin, false),
    'username_changed_at', u.username_changed_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.auth_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_identity() TO anon, authenticated;

-- ─── 4. 修改用户名 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.secure_change_username(
  p_new_username TEXT,
  p_password TEXT,
  p_new_pubkey TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_old TEXT;
  v_new TEXT;
  v_uid BIGINT;
  v_hash TEXT;
  v_pub TEXT;
  v_no BIGINT;
  v_changed TIMESTAMPTZ;
  v_old_jb JSONB;
  v_new_jb JSONB;
  v_old_x TEXT;
  v_new_x TEXT;
  v_days INT;
BEGIN
  v_old := public.current_app_username();
  IF v_old IS NULL THEN
    RAISE EXCEPTION '会话无效，请重新登录';
  END IF;

  PERFORM public.check_rate_limit('change_username', 10, v_old);

  v_new := btrim(COALESCE(p_new_username, ''));
  IF length(v_new) < 3 OR length(v_new) > 20 OR v_new ~ '[<>&"/;]' THEN
    RAISE EXCEPTION '用户名格式不合法';
  END IF;
  IF lower(v_new) = lower(v_old) THEN
    RAISE EXCEPTION '新用户名不能与当前用户名相同';
  END IF;
  IF lower(v_new) = 'system' THEN
    RAISE EXCEPTION '该用户名已被保留';
  END IF;

  SELECT id, password_hash, pubkey, user_no, username_changed_at
    INTO v_uid, v_hash, v_pub, v_no, v_changed
    FROM public.users
   WHERE username = v_old
   FOR UPDATE;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '用户不存在';
  END IF;

  -- Stone（user_no=1）允许改回 Stone；其他用户不能占用保留名
  IF lower(v_new) = 'stone' AND COALESCE(v_no, 0) <> 1 THEN
    RAISE EXCEPTION '该用户名已被保留';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
     WHERE lower(username) = lower(v_new)
       AND username <> v_old
  ) THEN
    RAISE EXCEPTION '用户名已存在';
  END IF;

  IF v_hash IS NULL OR v_hash <> crypt(p_password, v_hash) THEN
    RAISE EXCEPTION '当前密码不正确';
  END IF;

  IF v_changed IS NOT NULL AND v_changed > now() - interval '30 days' THEN
    v_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_changed + interval '30 days' - now())) / 86400)::INT);
    RAISE EXCEPTION '用户名 30 天内只能修改一次，还需等待 % 天', v_days;
  END IF;

  IF p_new_pubkey IS NULL OR length(p_new_pubkey) > 8192 THEN
    RAISE EXCEPTION '密钥备份无效，请重新登录后再试';
  END IF;
  BEGIN
    v_new_jb := p_new_pubkey::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '密钥备份格式不正确';
  END;
  IF v_new_jb -> 'pub' ->> 'kty' IS NULL
     OR v_new_jb ->> 'encPriv' IS NULL
     OR length(v_new_jb ->> 'encPriv') < 20 THEN
    RAISE EXCEPTION '密钥备份格式不正确';
  END IF;

  BEGIN
    v_old_jb := v_pub::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_old_jb := NULL;
  END;
  v_old_x := COALESCE(v_old_jb -> 'pub' ->> 'x', v_old_jb ->> 'x');
  v_new_x := v_new_jb -> 'pub' ->> 'x';
  IF v_old_x IS NOT NULL AND v_new_x IS DISTINCT FROM v_old_x THEN
    RAISE EXCEPTION '加密公钥不匹配，请重新登录后再试';
  END IF;

  -- 先改 users，再改 sessions：后续更新 posts 时会触发 guard_announcement，
  -- 它按 current_app_username() 判定管理员；会话必须先指向新名字，
  -- 否则改名者自己发的公告会被误降级。
  BEGIN
    UPDATE public.users
       SET username = v_new,
           pubkey = p_new_pubkey,
           username_changed_at = now()
     WHERE id = v_uid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION '用户名已存在';
  END;

  UPDATE public.sessions SET username = v_new WHERE username = v_old;

  UPDATE public.posts        SET author      = v_new WHERE author      = v_old;
  UPDATE public.comments     SET author      = v_new WHERE author      = v_old;
  UPDATE public.follows      SET follower    = v_new WHERE follower    = v_old;
  UPDATE public.follows      SET following   = v_new WHERE following   = v_old;
  UPDATE public.notifications SET user_to    = v_new WHERE user_to     = v_old;
  UPDATE public.notifications SET user_from  = v_new WHERE user_from   = v_old;
  UPDATE public.dm_messages  SET sender      = v_new WHERE sender      = v_old;
  UPDATE public.dm_messages  SET receiver    = v_new WHERE receiver    = v_old;
  UPDATE public.dm_pins      SET username    = v_new WHERE username    = v_old;
  UPDATE public.dm_pins      SET pinned_user = v_new WHERE pinned_user = v_old;
  UPDATE public.group_chats  SET creator     = v_new WHERE creator     = v_old;
  UPDATE public.group_members SET username   = v_new WHERE username    = v_old;
  UPDATE public.group_messages SET sender    = v_new WHERE sender      = v_old;
  UPDATE public.post_likes   SET username    = v_new WHERE username    = v_old;
  UPDATE public.user_growth  SET username    = v_new WHERE username    = v_old;
  UPDATE public.posts        SET featured_by = v_new WHERE featured_by = v_old;
  UPDATE public.users        SET banned_by   = v_new WHERE banned_by   = v_old;

  INSERT INTO public.auth_events(kind, actor)
  VALUES ('change_username', v_old);

  RETURN jsonb_build_object('ok', true, 'username', v_new, 'user_no', v_no);
END;
$fn$;

REVOKE ALL ON FUNCTION public.secure_change_username(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_change_username(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ─── 5. 超管判定：从用户名硬编码改为不可变 user_no = 1 ──────────────────────
UPDATE public.users SET is_admin = true WHERE user_no = 1;

CREATE OR REPLACE FUNCTION public.admin_overview() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT; v_no BIGINT;
BEGIN
  v_actor := public.growth_assert_admin();
  SELECT user_no INTO v_no FROM public.users WHERE username = v_actor;
  RETURN jsonb_build_object(
    'ok', true, 'actor', v_actor, 'is_super', COALESCE(v_no = 1, false),
    'posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'author', author,
        'content', left(COALESCE(content,''), 80), 'created_at', created_at,
        'is_featured', COALESCE(is_featured, false), 'is_announcement', COALESCE(is_announcement,false))
        ORDER BY created_at DESC)
      FROM (SELECT * FROM public.posts ORDER BY created_at DESC LIMIT 40) p), '[]'::jsonb),
    -- 保留 v14_admin_xp 的 level/total_xp，并补上 user_no 供 ID 展示与超管判定
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'username', q.username, 'user_no', q.user_no,
        'is_admin', q.is_admin, 'is_banned', q.is_banned,
        'created_at', q.created_at,
        'level', COALESCE(q.level, 1), 'total_xp', COALESCE(q.total_xp, 0))
        ORDER BY q.created_at DESC)
      FROM (SELECT u.id, u.username, u.user_no, u.is_admin, u.is_banned, u.created_at,
                   g.level, g.total_xp
              FROM public.users u
              LEFT JOIN public.user_growth g ON g.user_id = u.id
             ORDER BY u.created_at DESC LIMIT 60) q), '[]'::jsonb),
    'log', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('actor', actor, 'action', action,
        'target_id', target_id, 'created_at', created_at, 'detail', detail)
        ORDER BY created_at DESC)
      FROM (SELECT * FROM public.admin_actions ORDER BY created_at DESC LIMIT 30) l), '[]'::jsonb)
  );
END;
$fn$;

-- 超管经验发放：在 v14_admin_xp.sql 之后覆盖一次，把 actor = 'Stone' 改成 user_no=1。
CREATE OR REPLACE FUNCTION public.admin_grant_xp(
  p_username TEXT, p_xp INT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_actor TEXT; v_actor_no BIGINT; v_uid BIGINT; v_uname TEXT;
  v_before BIGINT := 0; v_after BIGINT := 0;
  v_level INT; v_enabled BOOLEAN; v_reason TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  SELECT user_no INTO v_actor_no FROM public.users WHERE username = v_actor;
  IF COALESCE(v_actor_no, 0) <> 1 THEN
    RAISE EXCEPTION '只有超级管理员（ID 1）可以发放经验';
  END IF;

  v_uname := btrim(COALESCE(p_username, ''));
  IF v_uname = '' THEN RAISE EXCEPTION '请先选择要发放经验的用户'; END IF;
  IF p_xp IS NULL OR p_xp = 0 THEN RAISE EXCEPTION '经验值必须是非零整数'; END IF;
  IF p_xp > 2000 OR p_xp < -2000 THEN RAISE EXCEPTION '单次调整范围是 -2000 ~ 2000 XP'; END IF;

  v_reason := btrim(left(COALESCE(p_reason, ''), 80));
  IF v_reason = '' THEN RAISE EXCEPTION '请填写发放理由，这条记录会写进管理员日志'; END IF;

  SELECT id INTO v_uid FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL THEN RAISE EXCEPTION '用户不存在：%', v_uname; END IF;

  INSERT INTO public.user_growth(user_id, username, joined_at)
  SELECT u.id, u.username, COALESCE(u.created_at, now())
    FROM public.users u WHERE u.id = v_uid
  ON CONFLICT (user_id) DO NOTHING;

  SELECT total_xp, honors_enabled INTO v_before, v_enabled
    FROM public.user_growth WHERE user_id = v_uid;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION '对方未开启 STG 荣誉体系，经验会被忽略。请对方在「设置 → 功能」中开启（或先登录一次本站）';
  END IF;

  v_after := v_before + p_xp;
  IF v_after < 0 THEN
    RAISE EXCEPTION '扣除后经验不能为负（对方当前 % XP）', v_before;
  END IF;
  v_level := public.honors_level_for_xp(v_after);

  INSERT INTO public.xp_transactions(user_id, amount, event_type, source_id, idempotency_key)
  VALUES (v_uid, p_xp, 'admin_grant', NULL, 'grant:' || gen_random_uuid()::text);

  UPDATE public.user_growth
     SET total_xp = v_after, level = v_level, updated_at = now()
   WHERE user_id = v_uid;

  PERFORM public.honors_check_achievements(v_uid);

  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, 'grant_xp', 'user', v_uname,
          jsonb_build_object('xp', p_xp, 'reason', v_reason,
                             'before', v_before, 'after', v_after, 'level', v_level));

  RETURN jsonb_build_object(
    'ok', true, 'username', v_uname, 'xp', p_xp,
    'before', v_before, 'total_xp', v_after, 'level', v_level, 'reason', v_reason);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_username TEXT, p_banned BOOLEAN, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT; v_target_no BIGINT;
BEGIN
  v_actor := public.growth_assert_admin();
  SELECT user_no INTO v_target_no FROM public.users WHERE username = p_username;
  IF v_target_no = 1 THEN RAISE EXCEPTION '不能封禁超级管理员'; END IF;
  IF p_username = v_actor THEN RAISE EXCEPTION '不能封禁自己'; END IF;
  UPDATE public.users SET is_banned = COALESCE(p_banned, false),
         ban_reason = CASE WHEN COALESCE(p_banned,false) THEN left(COALESCE(p_reason,''),200) ELSE NULL END,
         banned_at = CASE WHEN COALESCE(p_banned,false) THEN now() ELSE NULL END,
         banned_by = CASE WHEN COALESCE(p_banned,false) THEN v_actor ELSE NULL END
   WHERE username = p_username;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, CASE WHEN COALESCE(p_banned,false) THEN 'ban_user' ELSE 'unban_user' END,
          'user', p_username, jsonb_build_object('reason', COALESCE(p_reason,'')));
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_promote(p_username TEXT, p_admin BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT; v_actor_no BIGINT; v_target_no BIGINT;
BEGIN
  v_actor := public.growth_assert_admin();
  SELECT user_no INTO v_actor_no FROM public.users WHERE username = v_actor;
  IF COALESCE(v_actor_no, 0) <> 1 THEN
    RAISE EXCEPTION '只有超级管理员（ID 1）可以调整管理员权限';
  END IF;
  SELECT user_no INTO v_target_no FROM public.users WHERE username = p_username;
  IF v_target_no = 1 THEN RAISE EXCEPTION '不能修改超级管理员自身的权限'; END IF;
  UPDATE public.users SET is_admin = COALESCE(p_admin, false) WHERE username = p_username;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, CASE WHEN COALESCE(p_admin,false) THEN 'promote' ELSE 'demote' END,
          'user', p_username, jsonb_build_object('is_admin', COALESCE(p_admin,false)));
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_xp(TEXT, INT, TEXT) TO anon, authenticated;

-- 通知 PostgREST 刷新 schema cache，避免新列/新 RPC 短暂 404
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 执行后自检（可单独跑）：
--   SELECT username, user_no FROM public.users
--    WHERE username IN ('SYSTEM','Stone','admin') ORDER BY user_no NULLS LAST;
--       -- Stone=1，admin=2，SYSTEM 为 NULL
--   SELECT count(*) AS dupes FROM (
--     SELECT user_no FROM public.users WHERE user_no IS NOT NULL
--      GROUP BY user_no HAVING count(*) > 1) t;              -- 应为 0
--   SELECT last_value, is_called FROM public.user_no_seq;    -- next 应为 max+1
--   SELECT public.auth_identity();                            -- 登录后调用
--   SELECT has_function_privilege('anon',
--     'public.secure_change_username(TEXT,TEXT,TEXT)','EXECUTE'); -- true
-- ============================================================================
