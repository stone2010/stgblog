-- STGBLOG v16 · 图片能力：真人认证解锁头像背景 / 发帖图片额度 / 私信图片阅后即焚
-- 用法：在 Supabase SQL Editor 整段执行；幂等，可重复执行。
-- 依赖：v11_security.sql、v13_growth.sql（含 v13_1_upload_lv3.sql 亦可）、v15_identity.sql
-- 注意：执行本文件后不要再单独重跑 v13_growth.sql，否则会把旧门槛覆盖回来。

-- ─── 0. 新列 ──────────────────────────────────────────────────────────────
-- 帖子图片：data URL 数组（前端已压到每张 ≤200KB），最多 3 张。
-- 私信图片：data URL；接收方查看后由前端写入 IndexedDB 并把本列清空 = 云端删除。
ALTER TABLE public.posts       ADD COLUMN IF NOT EXISTS images     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS image_data TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_featured_author ON public.posts(author) WHERE COALESCE(is_featured, false);

-- 列级授权：posts / dm_messages 本来就是整表 SELECT/INSERT/UPDATE/DELETE 授权，
-- 这里幂等重申一次，避免以后收紧到列级时漏掉新列。
GRANT SELECT, INSERT, UPDATE ON TABLE public.posts       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dm_messages TO anon, authenticated;


-- ─── 1. growth_state：上传权限改为「认证 / 精华作者 / 管理员」 + 图片额度 ───
CREATE OR REPLACE FUNCTION public.growth_state() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uid BIGINT; v_uname TEXT; g RECORD; u RECORD;
  v_posts INT; v_comments INT; v_stamps INT; v_imgs INT;
  v_admin BOOLEAN; v_verified BOOLEAN; v_featured BOOLEAN;
  v_sec INT; v_img_cap INT; v_unlimited BOOLEAN;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_session'); END IF;
  v_uid := public.growth_ensure_user();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_session'); END IF;

  SELECT * INTO g FROM public.user_growth WHERE user_id = v_uid;
  SELECT is_admin, is_banned INTO u FROM public.users WHERE id = v_uid;
  v_admin    := COALESCE(u.is_admin, false);
  v_verified := COALESCE(g.is_verified, false);
  v_featured := EXISTS (SELECT 1 FROM public.posts WHERE author = v_uname AND COALESCE(is_featured, false));
  v_unlimited := v_admin OR v_verified OR v_featured;
  v_sec := COALESCE(g.pow_seconds, 0)::INT;

  SELECT count(*) INTO v_posts FROM public.posts
   WHERE author = v_uname AND created_at >= current_date
     AND COALESCE(is_announcement, false) = false;
  SELECT count(*) INTO v_comments FROM public.comments
   WHERE author = v_uname AND created_at >= current_date;
  SELECT count(*) INTO v_stamps FROM public.pow_stamps
   WHERE user_id = v_uid AND consumed_at IS NULL AND created_at >= current_date;
  SELECT COALESCE(sum(CASE WHEN jsonb_typeof(images) = 'array'
                           THEN jsonb_array_length(images) ELSE 0 END), 0)::INT
    INTO v_imgs FROM public.posts
   WHERE author = v_uname AND created_at >= current_date;

  -- 每跑满 600 秒（10 分钟）hash 得 3 张图片额度；认证 / 精华作者 / 管理员不限量。
  v_img_cap := CASE WHEN v_unlimited THEN 9999 ELSE (v_sec / 600) * 3 END;

  RETURN jsonb_build_object(
    'ok', true, 'username', v_uname,
    'level', g.level, 'total_xp', g.total_xp, 'reputation', g.reputation,
    'active_days', g.active_days, 'post_count', g.post_count, 'reply_count', g.reply_count,
    'honors_enabled', g.honors_enabled,
    'signin_today', COALESCE(g.last_signin_date = current_date, false),
    'signin_streak', g.signin_streak,
    'pow_seconds', v_sec, 'is_verified', v_verified,
    'is_admin', v_admin, 'is_featured_author', v_featured,
    'is_banned', COALESCE(u.is_banned, false),
    'avatar_url', g.avatar_url, 'banner_url', g.banner_url,
    'can_upload', v_unlimited,
    'quota', jsonb_build_object(
      'posts_used', v_posts, 'posts_cap', CASE WHEN v_admin OR v_verified THEN 9999 ELSE 3 + v_stamps END,
      'comments_used', v_comments, 'comments_cap', CASE WHEN v_admin OR v_verified THEN 9999 ELSE 5 + v_stamps END,
      'stamps', v_stamps
    ),
    'image_quota', jsonb_build_object(
      'used', v_imgs, 'cap', v_img_cap,
      'unlimited', v_unlimited,
      'per_batch', 3, 'batch_seconds', 600,
      'next_in', CASE WHEN v_unlimited THEN 0 ELSE GREATEST(0, 600 - (v_sec % 600)) END
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


-- ─── 2. growth_set_image：认证 / 精华作者 / 管理员才放行 ────────────────────
CREATE OR REPLACE FUNCTION public.growth_set_image(p_kind TEXT, p_data TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uid BIGINT; v_uname TEXT; g RECORD; u RECORD; v_allowed BOOLEAN;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  v_uid := public.growth_ensure_user();
  SELECT * INTO g FROM public.user_growth WHERE user_id = v_uid;
  SELECT is_admin INTO u FROM public.users WHERE id = v_uid;
  v_allowed := COALESCE(g.is_verified, false) OR COALESCE(u.is_admin, false)
    OR EXISTS (SELECT 1 FROM public.posts WHERE author = v_uname AND COALESCE(is_featured, false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION '需要完成真人认证才能自定义头像与主页背景（精华帖作者与管理员不受限制）';
  END IF;
  IF p_kind NOT IN ('avatar', 'banner') THEN RAISE EXCEPTION '图片类型无效'; END IF;
  IF p_data IS NOT NULL THEN
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


-- ─── 3. 帖子图片额度触发器：覆盖 RPC 与直写两条发帖路径 ─────────────────────
CREATE OR REPLACE FUNCTION public.growth_image_quota_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uname TEXT; v_uid BIGINT; u RECORD; g RECORD;
  v_new INT := 0; v_used INT := 0; v_cap INT; v_img_text TEXT; v_has_growth BOOLEAN;

  r RECORD;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RETURN NEW; END IF;  -- RLS 外层拒绝匿名写入

  IF TG_TABLE_NAME = 'posts' AND jsonb_typeof(NEW.images) = 'array' THEN
    FOR r IN SELECT value FROM jsonb_array_elements(NEW.images) LOOP
      IF jsonb_typeof(r.value) = 'string' THEN
        v_img_text := r.value #>> '{}';
        IF length(v_img_text) > 300000 OR left(v_img_text, 11) <> 'data:image/' THEN
          RAISE EXCEPTION '帖子图片格式或体积不符合要求（每张上限 200KB）';
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;
  END IF;
  IF v_new = 0 THEN RETURN NEW; END IF;
  IF v_new > 3 THEN RAISE EXCEPTION '每篇帖子最多 3 张图片'; END IF;

  SELECT is_admin INTO u FROM public.users WHERE username = v_uname;
  IF COALESCE(u.is_admin, false) THEN RETURN NEW; END IF;
  SELECT user_id, pow_seconds, is_verified INTO g FROM public.user_growth WHERE username = v_uname;
  v_has_growth := FOUND;
  IF v_has_growth AND COALESCE(g.is_verified, false) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.posts WHERE author = v_uname AND COALESCE(is_featured, false)) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(CASE WHEN jsonb_typeof(images) = 'array'
                           THEN jsonb_array_length(images) ELSE 0 END), 0)::INT
    INTO v_used FROM public.posts
   WHERE author = v_uname AND created_at >= current_date;

  v_cap := CASE WHEN v_has_growth AND g.pow_seconds IS NOT NULL
                THEN (g.pow_seconds::INT / 600) * 3 ELSE 0 END;
  IF v_used + v_new > v_cap THEN
    RAISE EXCEPTION '图片额度不足：今日已用 % / % 张。每跑满 10 分钟 hash 得 3 张额度（完成真人认证、成为精华帖作者或管理员可不限量）',
      v_used, v_cap;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_growth_image_quota ON public.posts;
CREATE TRIGGER trg_growth_image_quota BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.growth_image_quota_guard();


-- ─── 4. create_post 四参重载：带图片发帖 ────────────────────────────────────
-- 保留旧三参版本，老调用点不受影响；前端传 p_images 时自动命中四参版本。
DROP FUNCTION IF EXISTS public.create_post(TEXT, TEXT, TEXT, JSONB);
CREATE FUNCTION public.create_post(p_username TEXT, p_content TEXT, p_category TEXT DEFAULT '动态', p_images JSONB DEFAULT '[]'::jsonb)
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
  IF p_images IS NULL THEN p_images := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_images) <> 'array' THEN RAISE EXCEPTION '图片参数不合法'; END IF;
  INSERT INTO public.posts
    (title, content, author, category, likes, views, reposts, pinned, edited, is_announcement, images)
  VALUES
    (left(p_content, 60), p_content, v_user, COALESCE(p_category, '动态'), 0, 0, 0, false, false, false, p_images)
  RETURNING * INTO v_post;
  RETURN v_post;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_post(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;


-- ─── 5. 自检 ───────────────────────────────────────────────────────────────
WITH c AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='posts' AND column_name='images') AS posts_images,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dm_messages' AND column_name='image_data') AS dm_image,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_post' AND p.pronargs=4) AS rpc4,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c2 ON c2.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c2.relnamespace
      WHERE n.nspname='public' AND c2.relname='posts' AND t.tgname='trg_growth_image_quota') AS trigger_ok,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='growth_state' AND p.prosrc LIKE '%image_quota%') AS quota_ok
)
SELECT CASE WHEN posts_images=1 AND dm_image=1 AND rpc4=1 AND trigger_ok=1 AND quota_ok=1
            THEN '✅ v16 图片能力已生效'
            ELSE '❌ 未完全生效，请重跑本文件' END AS verdict,
       posts_images, dm_image, rpc4, trigger_ok, quota_ok
FROM c;
