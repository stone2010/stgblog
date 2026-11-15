-- STGBLOG v13.1 · 头像 / 主页背景解锁等级 4 → 3
-- 背景：全站最高等级账号（Stone）只有 Lv.3，4 级门槛导致没有任何人能上传图片。
-- 用法：在 Supabase SQL Editor 整段执行即可，幂等、可重复执行。
-- 说明：本文件只重定义两个受影响的函数；`v13_growth.sql` 里的对应定义已同步改为 3 级。
--       未执行过 v13_growth.sql 的库请直接跑 v13_growth.sql，不要用本文件。

-- ─── 1. 状态读取：can_upload 门槛改为 3 ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_state() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uid BIGINT; v_uname TEXT; g RECORD; u RECORD;
  v_posts INT; v_comments INT; v_stamps INT;
  v_admin BOOLEAN; v_verified BOOLEAN;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_session'); END IF;
  v_uid := public.growth_ensure_user();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_session'); END IF;

  SELECT * INTO g FROM public.user_growth WHERE user_id = v_uid;
  SELECT is_admin, is_banned INTO u FROM public.users WHERE id = v_uid;
  v_admin    := COALESCE(u.is_admin, false);
  v_verified := COALESCE(g.is_verified, false);

  SELECT count(*) INTO v_posts FROM public.posts
   WHERE author = v_uname AND created_at >= current_date
     AND COALESCE(is_announcement, false) = false;
  SELECT count(*) INTO v_comments FROM public.comments
   WHERE author = v_uname AND created_at >= current_date;
  SELECT count(*) INTO v_stamps FROM public.pow_stamps
   WHERE user_id = v_uid AND consumed_at IS NULL AND created_at >= current_date;

  RETURN jsonb_build_object(
    'ok', true, 'username', v_uname,
    'level', g.level, 'total_xp', g.total_xp, 'reputation', g.reputation,
    'active_days', g.active_days, 'post_count', g.post_count, 'reply_count', g.reply_count,
    'honors_enabled', g.honors_enabled,
    'signin_today', COALESCE(g.last_signin_date = current_date, false),
    'signin_streak', g.signin_streak,
    'pow_seconds', g.pow_seconds, 'is_verified', v_verified,
    'is_admin', v_admin, 'is_banned', COALESCE(u.is_banned, false),
    'avatar_url', g.avatar_url, 'banner_url', g.banner_url,
    'can_upload', (g.level >= 3),
    'quota', jsonb_build_object(
      'posts_used', v_posts, 'posts_cap', CASE WHEN v_admin OR v_verified THEN 9999 ELSE 3 + v_stamps END,
      'comments_used', v_comments, 'comments_cap', CASE WHEN v_admin OR v_verified THEN 9999 ELSE 5 + v_stamps END,
      'stamps', v_stamps
    ),
    'tasks', jsonb_build_array(
      jsonb_build_object('code','signin','label','每日签到','xp',5,
        'done',COALESCE(g.last_signin_date = current_date, false)),
      jsonb_build_object('code','first_post','label','当日首篇主题','xp',5,
        'done',(v_posts > 0)),
      jsonb_build_object('code','first_reply','label','当日首次回复','xp',5,
        'done',(v_comments > 0))
    )
  );
END;
$fn$;

-- ─── 2. 写库校验：真正拦截上传的地方，同样改为 3 ───────────────────────────
CREATE OR REPLACE FUNCTION public.growth_set_image(p_kind TEXT, p_data TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uid BIGINT; v_uname TEXT; g RECORD;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  v_uid := public.growth_ensure_user();
  SELECT * INTO g FROM public.user_growth WHERE user_id = v_uid;
  IF g.level < 3 THEN RAISE EXCEPTION '需要达到 Lv.3 才能自定义头像与主页背景'; END IF;
  IF p_kind NOT IN ('avatar', 'banner') THEN RAISE EXCEPTION '图片类型无效'; END IF;
  IF p_data IS NOT NULL THEN
    -- 200KB 二进制 → base64 273,068 字符 + data:image/...;base64, 前缀约 23 字符。
    -- 取 274000 作为服务端硬上限，前端 compressImage 已按真实字节数压到 ≤204800。
    IF length(p_data) > 274000 OR left(p_data, 11) <> 'data:image/' THEN
      RAISE EXCEPTION '图片格式或体积不符合要求（上限 200KB）';
    END IF;
  END IF;
  IF p_kind = 'avatar' THEN
    UPDATE public.user_growth SET avatar_url = p_data, updated_at = now() WHERE user_id = v_uid;
    UPDATE public.users SET avatar_url = p_data WHERE id = v_uid;
  ELSE
    UPDATE public.user_growth SET banner_url = p_data, updated_at = now() WHERE user_id = v_uid;
    UPDATE public.users SET banner_url = p_data WHERE id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', p_kind);
END;
$fn$;

-- ─── 3. 自检：三列应分别为 true / true / false ──────────────────────────────
SELECT p.proname,
       (p.prosrc LIKE '%g.level >= 3%') AS state_lv3,
       (p.prosrc LIKE '%g.level < 3%')  AS image_lv3,
       (p.prosrc LIKE '%Lv.4%')         AS still_has_old
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('growth_state', 'growth_set_image')
 ORDER BY p.proname;
