-- ============================================================================
-- STGBLOG v11.0 安全加固：服务端会话 + 全表 RLS + 归属校验
-- 在 Supabase Dashboard → SQL Editor 中以项目所有者身份执行
--
-- 【执行前必读】
-- 1. 先做一次数据库备份（Dashboard → Database → Backups）。
-- 2. 本脚本幂等，可重复执行；建议按分段顺序整段执行。
-- 3. 执行后请让所有用户【重新登录一次】以获取会话令牌。旧 localStorage
--    会话没有令牌，读公开内容仍正常，但写入会被 RLS 拒绝（预期行为）。
-- 4. 配套的前端改动已在 src/supabase.js：登录/注册 RPC 返回 session_token，
--    之后每个请求自动带上 x-stgblog-session 头。
-- 5. 与旧版完全兼容：前端仍保留大量直接写库调用，本脚本不撤销 anon 的
--    表级写权限，而是用 RLS 策略做归属校验 —— 有会话且是本人才能写，
--    匿名（无令牌）一律拒绝。因此不需要前端全部改成 RPC 也不会瘫站。
-- 6. 【阶段二未完成】users.pubkey 里仍含 encPriv（用口令派生的私钥备份）。
--    本脚本已隐藏 password_hash 列，但 pubkey 前端必须可读。彻底隔离需要
--    把 encPriv 拆到独立表并同步改登录链路，留待下一轮，不要在此脚本里强改。
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 第 0 段：扩展与 schema 漂移补齐（对照 2026-11-07 评审报告 §5）
-- 注意：不要给已删除的 users.password 明文列加约束（旧 v7 脚本会因此报错）
-- ────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.dm_pins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  pinned_user TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(username, pinned_user)
);
CREATE INDEX IF NOT EXISTS idx_dm_pins_user ON public.dm_pins(username);

CREATE TABLE IF NOT EXISTS public.keepalive (
  id BIGSERIAL PRIMARY KEY,
  source TEXT DEFAULT 'github-actions',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dm_privacy TEXT DEFAULT 'open';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dm_key TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS delete_request BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS delete_request_target BIGINT;
ALTER TABLE public.group_chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_posts_is_announcement ON public.posts(is_announcement, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON public.posts(author, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_messages_pair ON public.dm_messages(sender, receiver, created_at DESC);

-- 管理员身份由服务端判定，客户端 localStorage 无法伪造
UPDATE public.users SET is_admin = true WHERE username = 'Stone';

-- ────────────────────────────────────────────────────────────────────────────
-- 第 1 段：会话层
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(username);

CREATE TABLE IF NOT EXISTS public.auth_events (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor ON public.auth_events(actor, created_at DESC);

-- 从 PostgREST 请求头解析会话令牌，返回当前用户名；无效/过期/无令牌返回 NULL
CREATE OR REPLACE FUNCTION public.current_app_username()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_hdr TEXT;
  v_user TEXT;
BEGIN
  BEGIN
    v_hdr := current_setting('request.headers', true)::json ->> 'x-stgblog-session';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_hdr IS NULL OR length(v_hdr) < 8 THEN
    RETURN NULL;
  END IF;
  SELECT s.username INTO v_user
    FROM public.sessions s
   WHERE s.token_hash = encode(digest(v_hdr, 'sha256'), 'hex')
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
   LIMIT 1;
  RETURN v_user;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.issue_session(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_tok TEXT;
BEGIN
  v_tok := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.sessions(username, token_hash, expires_at)
  VALUES (p_username, encode(digest(v_tok, 'sha256'), 'hex'), now() + interval '30 days');
  RETURN v_tok;
END;
$fn$;

-- 简单限流：同 IP 一分钟内注册 ≤5 次、登录 ≤30 次
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_kind TEXT, p_limit INT, p_actor_hint TEXT DEFAULT '')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_ip TEXT;
  v_actor TEXT;
  v_cnt INT;
BEGIN
  BEGIN
    v_ip := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;
  -- 拿不到 IP 时退回按用户名分桶，避免所有用户共用同一个限流桶被误伤
  v_actor := COALESCE(NULLIF(v_ip, ''), NULLIF(p_actor_hint, ''), 'unknown');
  SELECT count(*) INTO v_cnt
    FROM public.auth_events
   WHERE kind = p_kind AND actor = v_actor
     AND created_at > now() - interval '1 minute';
  IF v_cnt >= p_limit THEN
    RAISE EXCEPTION '操作过于频繁，请稍后再试';
  END IF;
  INSERT INTO public.auth_events(kind, actor) VALUES (p_kind, v_actor);
  DELETE FROM public.auth_events WHERE created_at < now() - interval '1 hour';
END;
$fn$;

-- 重写登录：保留原有 4 个返回列，追加 session_token；bcrypt 兼容旧 cost-6 哈希
DROP FUNCTION IF EXISTS public.secure_login(TEXT, TEXT);
CREATE FUNCTION public.secure_login(p_username TEXT, p_password TEXT)
RETURNS TABLE(username TEXT, hash_id TEXT, pubkey TEXT, bio TEXT, session_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_user TEXT;
  v_tok TEXT;
BEGIN
  PERFORM public.check_rate_limit('login', 30, p_username);
  SELECT u.username INTO v_user
    FROM public.users u
   WHERE u.username = p_username
     AND u.password_hash = crypt(p_password, u.password_hash);
  IF v_user IS NULL THEN RETURN; END IF;
  v_tok := public.issue_session(v_user);
  RETURN QUERY
    SELECT u.username, u.hash_id, u.pubkey, u.bio, v_tok
      FROM public.users u
     WHERE u.username = v_user;
END;
$fn$;

-- 重写注册：bcrypt cost 12（旧 v8 是 cost 6），并下发会话令牌
DROP FUNCTION IF EXISTS public.secure_register(TEXT, TEXT, TEXT, TEXT);
CREATE FUNCTION public.secure_register(
  p_username TEXT, p_password TEXT, p_hash_id TEXT, p_pubkey TEXT
)
RETURNS TABLE(username TEXT, hash_id TEXT, pubkey TEXT, bio TEXT, session_token TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_tok TEXT;
BEGIN
  PERFORM public.check_rate_limit('register', 5, p_username);
  -- 允许中文用户名（与前端 /^[\u4e00-\u9fa5A-Za-z0-9_]{3,20}$/ 保持一致），
  -- 只校验长度并拒绝危险字符，避免误伤存量中文账号
  IF p_username IS NULL OR length(p_username) < 3 OR length(p_username) > 20
     OR p_username ~ '[<>&"/;]' THEN
    RAISE EXCEPTION '用户名格式不合法';
  END IF;
  IF length(p_password) < 6 THEN
    RAISE EXCEPTION '密码至少 6 位';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.username = p_username) THEN
    RAISE EXCEPTION '用户名已存在';
  END IF;
  INSERT INTO public.users(username, password_hash, hash_id, pubkey, bio)
  VALUES (p_username, crypt(p_password, gen_salt('bf', 12)), p_hash_id, p_pubkey, '');
  v_tok := public.issue_session(p_username);
  RETURN QUERY
    SELECT u.username, u.hash_id, u.pubkey, u.bio, v_tok
      FROM public.users u WHERE u.username = p_username;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.logout()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_hdr TEXT;
BEGIN
  BEGIN
    v_hdr := current_setting('request.headers', true)::json ->> 'x-stgblog-session';
  EXCEPTION WHEN OTHERS THEN RETURN; END;
  IF v_hdr IS NULL THEN RETURN; END IF;
  UPDATE public.sessions SET revoked_at = now()
   WHERE token_hash = encode(digest(v_hdr, 'sha256'), 'hex');
END;
$fn$;

-- 修改密码：身份只从会话取，不接受客户端用户名；重算 cost-12 哈希，
-- 并用新口令重新包裹 encPriv（客户端传入），保证跨设备仍可解密历史私信
CREATE OR REPLACE FUNCTION public.change_password(
  p_old_password TEXT, p_new_password TEXT, p_new_enc_priv TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_user TEXT;
  v_hash TEXT;
  v_pub TEXT;
  v_jb JSONB;
  v_newpub TEXT;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN
    RAISE EXCEPTION '会话无效，请重新登录';
  END IF;
  IF length(p_new_password) < 6 THEN
    RAISE EXCEPTION '新密码至少 6 位';
  END IF;
  SELECT u.password_hash, u.pubkey INTO v_hash, v_pub
    FROM public.users u WHERE u.username = v_user;
  IF v_hash IS NULL OR v_hash <> crypt(p_old_password, v_hash) THEN
    RAISE EXCEPTION '旧密码不正确';
  END IF;
  IF p_new_enc_priv IS NOT NULL THEN
    BEGIN
      v_jb := v_pub::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_jb := NULL;
    END;
    IF v_jb IS NOT NULL THEN
      v_newpub := jsonb_build_object(
        'pub', COALESCE(v_jb -> 'pub', v_jb),
        'encPriv', p_new_enc_priv
      )::text;
    END IF;
  END IF;
  UPDATE public.users
     SET password_hash = crypt(p_new_password, gen_salt('bf', 12)),
         pubkey = COALESCE(v_newpub, pubkey)
   WHERE username = v_user;
  RETURN TRUE;
END;
$fn$;

-- 原子计数器（v7 定义过但线上未上线；前端 utils.js 已改为优先调用）
CREATE OR REPLACE FUNCTION public.increment_likes(p_post_id BIGINT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions
AS $$ UPDATE public.posts SET likes = COALESCE(likes, 0) + 1 WHERE id = p_post_id; $$;

CREATE OR REPLACE FUNCTION public.increment_views(p_post_id BIGINT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions
AS $$ UPDATE public.posts SET views = COALESCE(views, 0) + 1 WHERE id = p_post_id; $$;

CREATE OR REPLACE FUNCTION public.increment_reposts(p_post_id BIGINT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions
AS $$ UPDATE public.posts SET reposts = COALESCE(reposts, 0) + 1 WHERE id = p_post_id; $$;

-- 安全发帖：保留旧签名以便前端无需改动，但【忽略 p_username】，身份只从会话取
DROP FUNCTION IF EXISTS public.create_post(TEXT, TEXT, TEXT);
CREATE FUNCTION public.create_post(p_username TEXT, p_content TEXT, p_category TEXT DEFAULT '动态')
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_user TEXT;
  v_post public.posts;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  IF p_content IS NULL OR length(trim(p_content)) = 0 OR length(p_content) > 5000 THEN
    RAISE EXCEPTION '内容长度不合法';
  END IF;
  INSERT INTO public.posts
    (title, content, author, category, likes, views, reposts, pinned, edited, is_announcement)
  VALUES
    (left(p_content, 60), p_content, v_user, COALESCE(p_category, '动态'), 0, 0, 0, false, false, false)
  RETURNING * INTO v_post;
  RETURN v_post;
END;
$fn$;

-- 安全删帖 / 编辑：同样忽略客户端传入的用户名
DROP FUNCTION IF EXISTS public.delete_post(TEXT, BIGINT);
CREATE FUNCTION public.delete_post(p_username TEXT, p_post_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_user TEXT;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  DELETE FROM public.posts WHERE id = p_post_id AND author = v_user;
  RETURN FOUND;
END;
$fn$;

DROP FUNCTION IF EXISTS public.edit_post(TEXT, BIGINT, TEXT);
CREATE FUNCTION public.edit_post(p_username TEXT, p_post_id BIGINT, p_content TEXT)
RETURNS public.posts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_user TEXT; v_post public.posts;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  IF p_content IS NULL OR length(trim(p_content)) = 0 OR length(p_content) > 5000 THEN
    RAISE EXCEPTION '内容长度不合法';
  END IF;
  UPDATE public.posts
     SET content = p_content, title = left(p_content, 60), edited = true
   WHERE id = p_post_id AND author = v_user
  RETURNING * INTO v_post;
  RETURN v_post;
END;
$fn$;

DROP FUNCTION IF EXISTS public.follow_user(TEXT, TEXT);
CREATE FUNCTION public.follow_user(p_follower TEXT, p_following TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_user TEXT;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  IF v_user = p_following THEN RAISE EXCEPTION '不能关注自己'; END IF;
  INSERT INTO public.follows(follower, following) VALUES (v_user, p_following)
  ON CONFLICT (follower, following) DO NOTHING;
END;
$fn$;

DROP FUNCTION IF EXISTS public.send_notification(TEXT, TEXT, TEXT, BIGINT, BIGINT);
CREATE FUNCTION public.send_notification(
  p_user_to TEXT, p_user_from TEXT, p_type TEXT,
  p_post_id BIGINT DEFAULT NULL, p_comment_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_user TEXT;
BEGIN
  v_user := public.current_app_username();
  IF v_user IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  IF p_user_to = v_user THEN RETURN; END IF;
  INSERT INTO public.notifications(user_to, user_from, type, post_id, comment_id)
  VALUES (p_user_to, v_user, p_type, p_post_id, p_comment_id);
END;
$fn$;

-- 公告只能由服务端判定的管理员写入（S-3）
CREATE OR REPLACE FUNCTION public.guard_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_user TEXT;
BEGIN
  IF NEW.is_announcement IS TRUE THEN
    v_user := public.current_app_username();
    IF v_user IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.username = v_user AND u.is_admin
    ) THEN
      NEW.is_announcement := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_guard_announcement ON public.posts;
CREATE TRIGGER trg_guard_announcement
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.guard_announcement();

-- 群成员判定辅助函数（SECURITY DEFINER，避免策略自引用造成递归）
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = p_group_id AND m.username = public.current_app_username()
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 第 2 段：全表 RLS
-- 思路：不撤销 anon 的表级写权限（前端仍有大量直接写库），而是让每条
-- 写策略都要求 current_app_username() 非空且归属正确。匿名无令牌 → 拒绝。
-- ────────────────────────────────────────────────────────────────────────────

-- 先清理所有历史 USING(true) 假策略
DO $do$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','posts','comments','dm_messages','follows','notifications',
    'group_chats','group_members','group_messages','dm_pins','keepalive',
    'sessions','auth_events'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies
              WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END
$do$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keepalive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

-- users：公开读（敏感列由第 3 段列级权限隐藏）；只能改自己；注册/删除只能走 RPC
CREATE POLICY users_select ON public.users FOR SELECT USING (true);
CREATE POLICY users_update ON public.users FOR UPDATE
  USING (username = public.current_app_username())
  WITH CHECK (username = public.current_app_username());
CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK (false);
CREATE POLICY users_delete ON public.users FOR DELETE USING (false);

-- posts
CREATE POLICY posts_select ON public.posts FOR SELECT USING (true);
CREATE POLICY posts_insert ON public.posts FOR INSERT
  WITH CHECK (author = public.current_app_username());
CREATE POLICY posts_update ON public.posts FOR UPDATE
  USING (author = public.current_app_username())
  WITH CHECK (author = public.current_app_username());
CREATE POLICY posts_delete ON public.posts FOR DELETE
  USING (author = public.current_app_username());

-- comments
CREATE POLICY comments_select ON public.comments FOR SELECT USING (true);
CREATE POLICY comments_insert ON public.comments FOR INSERT
  WITH CHECK (author = public.current_app_username());
CREATE POLICY comments_update ON public.comments FOR UPDATE
  USING (author = public.current_app_username())
  WITH CHECK (author = public.current_app_username());
CREATE POLICY comments_delete ON public.comments FOR DELETE
  USING (author = public.current_app_username());

-- dm_messages：只有会话双方可见（S-9）
CREATE POLICY dm_select ON public.dm_messages FOR SELECT
  USING (sender = public.current_app_username() OR receiver = public.current_app_username());
CREATE POLICY dm_insert ON public.dm_messages FOR INSERT
  WITH CHECK (sender = public.current_app_username());
CREATE POLICY dm_update ON public.dm_messages FOR UPDATE
  USING (sender = public.current_app_username() OR receiver = public.current_app_username())
  WITH CHECK (sender = public.current_app_username() OR receiver = public.current_app_username());
CREATE POLICY dm_delete ON public.dm_messages FOR DELETE
  USING (sender = public.current_app_username());

-- follows
CREATE POLICY follows_select ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_insert ON public.follows FOR INSERT
  WITH CHECK (follower = public.current_app_username());
CREATE POLICY follows_update ON public.follows FOR UPDATE USING (false);
CREATE POLICY follows_delete ON public.follows FOR DELETE
  USING (follower = public.current_app_username());

-- notifications
CREATE POLICY notif_select ON public.notifications FOR SELECT
  USING (user_to = public.current_app_username());
CREATE POLICY notif_insert ON public.notifications FOR INSERT
  WITH CHECK (user_from = public.current_app_username());
CREATE POLICY notif_update ON public.notifications FOR UPDATE
  USING (user_to = public.current_app_username())
  WITH CHECK (user_to = public.current_app_username());
CREATE POLICY notif_delete ON public.notifications FOR DELETE
  USING (user_to = public.current_app_username());

-- 群聊：仅成员可见，建群/改群/删群仅群主
CREATE POLICY group_chats_select ON public.group_chats FOR SELECT
  USING (public.is_group_member(group_chats.id));
CREATE POLICY group_chats_insert ON public.group_chats FOR INSERT
  WITH CHECK (creator = public.current_app_username());
CREATE POLICY group_chats_update ON public.group_chats FOR UPDATE
  USING (creator = public.current_app_username())
  WITH CHECK (creator = public.current_app_username());
CREATE POLICY group_chats_delete ON public.group_chats FOR DELETE
  USING (creator = public.current_app_username());

CREATE POLICY group_members_select ON public.group_members FOR SELECT
  USING (public.is_group_member(group_members.group_id));
CREATE POLICY group_members_insert ON public.group_members FOR INSERT
  WITH CHECK (username = public.current_app_username()
              OR public.is_group_member(group_members.group_id));
CREATE POLICY group_members_update ON public.group_members FOR UPDATE
  USING (public.is_group_member(group_members.group_id));
CREATE POLICY group_members_delete ON public.group_members FOR DELETE
  USING (public.is_group_member(group_members.group_id));

CREATE POLICY group_messages_select ON public.group_messages FOR SELECT
  USING (public.is_group_member(group_messages.group_id));
CREATE POLICY group_messages_insert ON public.group_messages FOR INSERT
  WITH CHECK (sender = public.current_app_username()
              AND public.is_group_member(group_messages.group_id));
CREATE POLICY group_messages_update ON public.group_messages FOR UPDATE
  USING (sender = public.current_app_username());
CREATE POLICY group_messages_delete ON public.group_messages FOR DELETE
  USING (sender = public.current_app_username());

-- 私信置顶：仅本人
CREATE POLICY dm_pins_select ON public.dm_pins FOR SELECT
  USING (username = public.current_app_username());
CREATE POLICY dm_pins_insert ON public.dm_pins FOR INSERT
  WITH CHECK (username = public.current_app_username());
CREATE POLICY dm_pins_update ON public.dm_pins FOR UPDATE
  USING (username = public.current_app_username());
CREATE POLICY dm_pins_delete ON public.dm_pins FOR DELETE
  USING (username = public.current_app_username());

-- 内部表：anon 一律不可直接读写
CREATE POLICY keepalive_select ON public.keepalive FOR SELECT USING (true);
CREATE POLICY keepalive_insert ON public.keepalive FOR INSERT WITH CHECK (false);
CREATE POLICY keepalive_update ON public.keepalive FOR UPDATE USING (false);
CREATE POLICY keepalive_delete ON public.keepalive FOR DELETE USING (false);
CREATE POLICY sessions_deny ON public.sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY auth_events_deny ON public.auth_events FOR ALL USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 第 3 段：权限收紧
-- 表级权限保留给 anon（前端直写需要），但 users 用列级权限隐藏 password_hash
-- （Postgres 表级权限会覆盖列级，所以必须先 REVOKE 表级再 GRANT 列级）
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.users FROM anon;
GRANT SELECT (id, username, hash_id, pubkey, bio, created_at, dm_privacy, dm_key, is_admin)
  ON TABLE public.users TO anon;
GRANT UPDATE (bio, pubkey, dm_privacy, dm_key) ON TABLE public.users TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.posts, public.comments, public.dm_messages, public.follows,
  public.notifications, public.group_chats, public.group_members,
  public.group_messages, public.dm_pins TO anon;
GRANT SELECT ON TABLE public.keepalive TO anon;

REVOKE ALL ON TABLE public.sessions, public.auth_events FROM anon;

GRANT EXECUTE ON FUNCTION public.current_app_username() TO anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.secure_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.secure_register(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.logout() TO anon;
GRANT EXECUTE ON FUNCTION public.change_password(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_post(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_post(TEXT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.edit_post(TEXT, BIGINT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.follow_user(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.send_notification(TEXT, TEXT, TEXT, BIGINT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_likes(BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_views(BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_reposts(BIGINT) TO anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 第 4 段：执行后自检（在 SQL Editor 里应看到全部 true / 期望值）
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
--   AND tablename IN ('users','posts','comments','dm_messages') ORDER BY tablename;
-- SELECT count(*) AS policy_count FROM pg_policies WHERE schemaname='public';
-- SELECT public.current_app_username() IS NULL AS anonymous_is_null;  -- 应为 true
-- SELECT has_column_privilege('anon','public.users','password_hash','SELECT') AS leak; -- 应为 false

-- ============================================================================
-- 回滚（仅在站点异常时应急使用；回滚会重新暴露越权漏洞，务必尽快修复重上）
-- ============================================================================
-- 如需快速恢复旧站可写状态，可执行以下语句（不推荐长期保留）：
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.posts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.comments DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.dm_messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.follows DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
-- GRANT ALL ON TABLE public.users TO anon;
-- ============================================================================
