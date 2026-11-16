-- ============================================================================
-- STGBLOG v14.0 — 超管经验发放 + 精华帖高额经验
-- 在 migrations/v13_growth.sql 之后执行。本文件幂等，可重复执行。
--
-- 【本次改动】
-- 1. admin_grant_xp(用户名, 经验, 理由)：仅超级管理员 Stone 可调用。
--    单次范围 -2000 ~ 2000（负数=扣除，用于纠错），必须写理由，全部留痕。
-- 2. admin_feature_post()：加精时给作者 +50 XP。每篇只发一次（幂等键 featured:<post_id>），
--    取消精华不回收 —— 与「删帖只标记不追扣」的既有策略保持一致。
-- 3. admin_overview()：用户列表补 level / total_xp（发经验前能看清对方现状），
--    操作日志补 detail（能看到发了多少、为什么发）。
-- 4. honors_on_post_delete()：删帖时把精华奖励也标记为 reversed（只标记，不扣总分）。
--
-- 【安全】仍沿用 v13 的判定链：一切身份都从 current_app_username() 重新取，
--         绝不信任前端参数；grant_xp 额外要求 actor = 'Stone'。
-- ============================================================================

BEGIN;

-- ─── 0. 前置校验 ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.growth_assert_admin()') IS NULL THEN
    RAISE EXCEPTION '缺少 growth_assert_admin()，请先执行 migrations/v13_growth.sql';
  END IF;
  IF to_regprocedure('public.honors_level_for_xp(bigint)') IS NULL THEN
    RAISE EXCEPTION '缺少 honors_level_for_xp()，请先执行 migrations/v12_honors.sql';
  END IF;
END $$;

-- ─── 1. 超管发放经验 ────────────────────────────────────────────────────────
-- 为什么不直接调 honors_award()：
--   · 它对方未开启荣誉体系时静默返回，管理员会以为发放成功；
--   · 它不校验负数、不校验理由、不写管理员日志。
-- 这里显式写 xp_transactions + user_growth，并返回发放前后的等级供前端提示。
CREATE OR REPLACE FUNCTION public.admin_grant_xp(
  p_username TEXT, p_xp INT, p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_actor TEXT; v_uid BIGINT; v_uname TEXT;
  v_before BIGINT := 0; v_after BIGINT := 0;
  v_level INT; v_enabled BOOLEAN; v_reason TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  IF v_actor <> 'Stone' THEN
    RAISE EXCEPTION '只有超级管理员 Stone 可以发放经验';
  END IF;

  v_uname := btrim(COALESCE(p_username, ''));
  IF v_uname = '' THEN RAISE EXCEPTION '请先选择要发放经验的用户'; END IF;
  IF p_xp IS NULL OR p_xp = 0 THEN RAISE EXCEPTION '经验值必须是非零整数'; END IF;
  IF p_xp > 2000 OR p_xp < -2000 THEN RAISE EXCEPTION '单次调整范围是 -2000 ~ 2000 XP'; END IF;

  v_reason := btrim(left(COALESCE(p_reason, ''), 80));
  IF v_reason = '' THEN RAISE EXCEPTION '请填写发放理由，这条记录会写进管理员日志'; END IF;

  SELECT id INTO v_uid FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL THEN RAISE EXCEPTION '用户不存在：%', v_uname; END IF;

  -- 成长档案缺失时补建（口径与 growth_ensure_user 一致）
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

  -- 每次发放都是独立事件，幂等键用随机串；不做「同一天同金额去重」，
  -- 否则管理员想连发两次同样的奖励会被静默吞掉。
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

-- ─── 2. 精华帖高额经验 ──────────────────────────────────────────────────────
-- 加精是一次编辑判断，所以奖励只发一次：幂等键固定为 featured:<post_id>。
-- 取消精华不回收经验（避免误点造成用户掉级），再次加精也不会重复发放。
CREATE OR REPLACE FUNCTION public.admin_feature_post(p_post_id BIGINT, p_featured BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_actor TEXT; v_author TEXT; v_uid BIGINT; v_enabled BOOLEAN;
  v_prev BOOLEAN; v_key TEXT; v_had INT := 0; v_xp INT := 0; v_note TEXT := '';
  c_featured_xp CONSTANT INT := 50;   -- 与前端 FEATURED_XP 保持一致
BEGIN
  v_actor := public.growth_assert_admin();

  SELECT author, COALESCE(is_featured, false) INTO v_author, v_prev
    FROM public.posts WHERE id = p_post_id;
  IF v_author IS NULL THEN RAISE EXCEPTION '帖子不存在'; END IF;

  UPDATE public.posts SET is_featured = COALESCE(p_featured, false),
         featured_by = CASE WHEN COALESCE(p_featured,false) THEN v_actor ELSE NULL END,
         featured_at = CASE WHEN COALESCE(p_featured,false) THEN now() ELSE NULL END
   WHERE id = p_post_id;

  IF COALESCE(p_featured, false) THEN
    SELECT id INTO v_uid FROM public.users WHERE username = v_author;
    IF v_uid IS NOT NULL THEN
      SELECT honors_enabled INTO v_enabled FROM public.user_growth WHERE user_id = v_uid;
      v_key := 'featured:' || p_post_id;
      SELECT count(*) INTO v_had FROM public.xp_transactions WHERE idempotency_key = v_key;

      IF v_enabled IS TRUE AND v_had = 0 THEN
        PERFORM public.honors_award(v_uid, 'featured', c_featured_xp, 0, p_post_id, v_key);
        v_xp := c_featured_xp;
      ELSIF v_had > 0 THEN
        v_note := '这篇之前已发过精华经验，不重复发放';
      ELSE
        v_note := '作者未开启荣誉体系，未发放经验';
      END IF;
    ELSE
      v_note := '找不到作者账号，未发放经验';
    END IF;
  END IF;

  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, CASE WHEN COALESCE(p_featured,false) THEN 'feature_post' ELSE 'unfeature_post' END,
          'post', p_post_id::text,
          jsonb_build_object('featured', COALESCE(p_featured,false), 'author', v_author,
                             'was_featured', COALESCE(v_prev,false), 'xp_awarded', v_xp));

  RETURN jsonb_build_object('ok', true, 'author', v_author,
                            'xp_awarded', v_xp, 'xp_note', v_note);
END;
$fn$;

-- ─── 3. 管理员总览：用户带等级，日志带明细 ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_overview() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  RETURN jsonb_build_object(
    'ok', true, 'actor', v_actor, 'is_super', (v_actor = 'Stone'),
    'posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'author', author,
        'content', left(COALESCE(content,''), 80), 'created_at', created_at,
        'is_featured', COALESCE(is_featured, false), 'is_announcement', COALESCE(is_announcement,false))
        ORDER BY created_at DESC)
      FROM (SELECT * FROM public.posts ORDER BY created_at DESC LIMIT 40) p), '[]'::jsonb),
    -- LEFT JOIN user_growth：没有成长档案的用户也要能出现在列表里（level/total_xp 取默认值）
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'username', q.username, 'is_admin', q.is_admin, 'is_banned', q.is_banned,
        'created_at', q.created_at,
        'level', COALESCE(q.level, 1), 'total_xp', COALESCE(q.total_xp, 0))
        ORDER BY q.created_at DESC)
      FROM (SELECT u.id, u.username, u.is_admin, u.is_banned, u.created_at, g.level, g.total_xp
              FROM public.users u
              LEFT JOIN public.user_growth g ON g.user_id = u.id
             ORDER BY u.created_at DESC LIMIT 60) q), '[]'::jsonb),
    'log', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('actor', actor, 'action', action,
        'target_id', target_id, 'created_at', created_at, 'detail', detail) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.admin_actions ORDER BY created_at DESC LIMIT 30) l), '[]'::jsonb)
  );
END;
$fn$;

-- ─── 4. 删帖：精华奖励一并标记为 reversed（只标记，不追扣总分）──────────────
CREATE OR REPLACE FUNCTION public.honors_on_post_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $fn$
BEGIN
  UPDATE public.xp_transactions SET reversed = TRUE
   WHERE source_id = OLD.id AND event_type IN ('post','backfill_post','featured');
  RETURN NULL;
END;
$fn$;

-- ─── 5. 授权 ────────────────────────────────────────────────────────────────
-- 新函数默认对 PUBLIC 可执行；这里收窄成只给 anon / authenticated，
-- 真正的权限判定在函数体内的 growth_assert_admin()。
REVOKE ALL ON FUNCTION public.admin_grant_xp(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_xp(TEXT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_feature_post(BIGINT, BOOLEAN) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 执行后自检（可单独跑，输出一行结论）：
-- ============================================================================
WITH f AS (
  SELECT p.proname, p.prosrc FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('admin_grant_xp','admin_feature_post','admin_overview','honors_on_post_delete')
), v AS (
  SELECT bool_or(proname = 'admin_grant_xp'         AND prosrc LIKE '%只有超级管理员 Stone 可以发放经验%') AS grant_ok,
         bool_or(proname = 'admin_feature_post'     AND prosrc LIKE '%c_featured_xp%')                  AS featured_ok,
         bool_or(proname = 'admin_overview'         AND prosrc LIKE '%total_xp%')                       AS overview_ok,
         bool_or(proname = 'honors_on_post_delete'  AND prosrc LIKE '%featured%')                       AS delete_ok
    FROM f
)
SELECT CASE WHEN grant_ok AND featured_ok AND overview_ok AND delete_ok
            THEN '✅ 已生效：超管可发放经验，精华帖 +50 XP'
            ELSE '❌ 未完全生效，请重跑本文件'
       END AS verdict,
       grant_ok, featured_ok, overview_ok, delete_ok
  FROM v;
-- ============================================================================
