-- ============================================================================
-- STGBLOG v12.0 — STG HONORS · 荣誉体系（opt-in，默认关闭）
-- 在 Supabase Dashboard → SQL Editor 中以项目所有者身份整段执行。
--
-- 【执行前必读】
-- 1. 先备份（Dashboard → Database → Backups）。本脚本幂等，可重复执行。
-- 2. 依赖 v11_security.sql 的 current_app_username()；未执行会直接报错停止。
-- 3. 执行后站点外观【完全不变】：所有荣誉 UI 由「设置 → 功能 → STG 荣誉体系」
--    开关控制，默认关闭；关闭时不请求任何新表、不写入任何成长数据、不计分。
-- 4. 不需要用户重新登录（不改会话链路）。
-- 5. 浏览量 posts.views 明确【不计入】任何 XP / 声望：increment_views 无鉴权，
--    可被任意调用刷高。点赞改为服务端唯一约束去重后才计分。
-- 6. 等级不是管理权限：本脚本不触碰 users.is_admin / 公告权限。
-- ============================================================================

BEGIN;

-- ─── 0. 前置校验 ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_app_username'
  ) THEN
    RAISE EXCEPTION '缺少 current_app_username()，请先执行 migrations/v11_security.sql';
  END IF;
END $$;

-- ─── 1. 表结构 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_growth (
  user_id          BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username         TEXT NOT NULL,
  honors_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  total_xp         BIGINT NOT NULL DEFAULT 0,
  level            INT NOT NULL DEFAULT 1,
  reputation       BIGINT NOT NULL DEFAULT 0,
  active_days      INT NOT NULL DEFAULT 0,
  post_count       INT NOT NULL DEFAULT 0,
  reply_count      INT NOT NULL DEFAULT 0,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_date DATE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_username ON public.user_growth(username);

CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount           INT NOT NULL,
  event_type       VARCHAR(40) NOT NULL,
  source_id        BIGINT,
  idempotency_key  VARCHAR(160) NOT NULL UNIQUE,
  reversed         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_user_time ON public.xp_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_kind_day  ON public.xp_transactions(user_id, event_type, created_at);

CREATE TABLE IF NOT EXISTS public.reputation_transactions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount           INT NOT NULL,
  event_type       VARCHAR(40) NOT NULL,
  source_id        BIGINT,
  idempotency_key  VARCHAR(160) NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_user_time ON public.reputation_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.achievements (
  id               BIGSERIAL PRIMARY KEY,
  code             VARCHAR(60) UNIQUE NOT NULL,
  name             VARCHAR(100) NOT NULL,
  description      TEXT NOT NULL,
  category         VARCHAR(40) NOT NULL,
  rarity           VARCHAR(20) NOT NULL,
  icon             VARCHAR(60) NOT NULL,
  condition_type   VARCHAR(60) NOT NULL,
  condition_value  BIGINT NOT NULL DEFAULT 1,
  is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id   BIGINT NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_ua_user ON public.user_achievements(user_id, unlocked_at DESC);
-- 「最多 3 枚精选」由下方 trg_honors_featured 触发器保证；此处【不能】建
-- (user_id) WHERE is_featured 唯一索引，否则会把上限误锁成 1 枚。
DROP INDEX IF EXISTS public.idx_ua_one_featured;

CREATE TABLE IF NOT EXISTS public.community_events (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type       VARCHAR(40) NOT NULL,
  target_type      VARCHAR(30),
  target_id        BIGINT,
  payload          JSONB NOT NULL DEFAULT '{}',
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_user ON public.community_events(user_id, created_at DESC);

-- 服务端唯一约束的「认可」记录：解决旧版点赞只靠 localStorage 去重、可清缓存重复刷
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id          BIGINT NOT NULL,
  username         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, username)
);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes(post_id);

-- ─── 2. RLS：写入一律只能经 security definer 函数 ──────────────────────────
-- 这样「前端篡改等级」在数据库层面就不成立，而不是靠前端自觉。
-- 读取分三层（隐私红线）：
--   · 公开：成就定义、已获徽章、以及下方视图里的等级汇总
--   · 仅本人：XP / 声望账本、原始事件、点赞记录（行为明细不外泄）
--   · 不公开：last_active_date（最后活跃日期）只留在 user_growth 原表
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_growth','xp_transactions','reputation_transactions',
    'achievements','user_achievements','community_events','post_likes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS honors_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS honors_ledger_select ON public.%I', t);
  END LOOP;
END $$;

-- 公开层
CREATE POLICY honors_select ON public.achievements FOR SELECT USING (true);
CREATE POLICY honors_select ON public.user_achievements FOR SELECT USING (true);
GRANT SELECT ON TABLE public.achievements TO anon, authenticated;
GRANT SELECT ON TABLE public.user_achievements TO anon, authenticated;

-- 仅本人层：用 v11 的服务端会话身份判定，匿名（无令牌）一律读不到
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'xp_transactions','reputation_transactions','community_events','post_likes'
  ] LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format(
      'CREATE POLICY honors_ledger_select ON public.%I FOR SELECT USING (%s)', t,
      CASE WHEN t = 'post_likes'
        THEN 'username = public.current_app_username()'
        ELSE 'user_id IN (SELECT id FROM public.users WHERE username = public.current_app_username())'
      END);
  END LOOP;
END $$;

-- 公开档案视图：只暴露等级/称号/汇总数，不暴露 last_active_date 等私密列。
-- 视图默认以所有者权限读取 user_growth；anon 不直接获得该表的 SELECT。
CREATE OR REPLACE VIEW public.honors_public_profiles AS
SELECT user_id, username, total_xp, level, reputation,
       active_days, post_count, reply_count, honors_enabled, joined_at
FROM public.user_growth;
GRANT SELECT ON public.honors_public_profiles TO anon, authenticated;

-- ─── 3. 等级曲线（STG HONORS 十级）─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.honors_level_for_xp(p_xp BIGINT)
RETURNS INT LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_xp >= 3200 THEN 10 WHEN p_xp >= 2500 THEN 9
    WHEN p_xp >= 1900 THEN 8  WHEN p_xp >= 1400 THEN 7
    WHEN p_xp >= 1000 THEN 6  WHEN p_xp >= 700  THEN 5
    WHEN p_xp >= 450  THEN 4  WHEN p_xp >= 250  THEN 3
    WHEN p_xp >= 100  THEN 2  ELSE 1 END;
$$;

-- ─── 4. 成就定义：一期 17 枚正式 + 3 枚隐藏 ────────────────────────────────
-- 只用线上真实存在的原始事件（posts / comments / users / user_growth）判定。
-- 「感谢 N 次 / 收藏 / 答案采纳 / 官方认证 / 社区活动」留到二期，避免
-- 出现永远无法解锁的空成就。数值按站点实际规模校正：
--   · 全领域探索 = 7 个 category（线上实际 7 个，而非方案里的 10 个板块）
--   · 旧帖考古 = 90 天（站点最早上线 2026-05-30，180 天条件当时无人可达）
--   · 时间旅行者 = 120 天（原「超过一年」在当前站龄下不可达）
INSERT INTO public.achievements
  (code,name,description,category,rarity,icon,condition_type,condition_value,is_hidden,sort_order) VALUES
  ('FIRST_POST',    '初次发声','发布第一篇有效主题','creation','common','message','valid_posts',1,false,10),
  ('POSTS_10',      '持续创作','发布 10 篇有效主题','creation','common','layers','valid_posts',10,false,11),
  ('POSTS_50',      '内容创作者','发布 50 篇有效主题','creation','rare','book','valid_posts',50,false,12),
  ('QUALITY_AUTHOR','优质作者','发布 5 篇 300 字以上的长主题','creation','epic','pen','quality_posts',5,false,13),
  ('TOPIC_LEADER',  '话题引领者','3 篇主题各自获得 5 条以上回复','creation','legend','spark','topic_posts',3,false,14),
  ('FIRST_REPLY',   '第一次回应','发布第一条有效回复','community','common','reply','valid_replies',1,false,20),
  ('FIRST_DAY',     '初次访问','完成首次有效参与','activity','common','sun','active_days',1,false,30),
  ('DAYS_7',        '常驻成员','累计有效参与 7 天','activity','common','calendar','active_days',7,false,31),
  ('DAYS_30',       '熟悉的身影','累计有效参与 30 天','activity','rare','footprint','active_days',30,false,32),
  ('DAYS_90',       '长期同行','累计有效参与 90 天','activity','epic','compass','active_days',90,false,33),
  ('DAYS_180',      '年度成员','累计有效参与 180 天','activity','legend','hourglass','active_days',180,false,34),
  ('CURIOSITY',     '好奇心','在 2 个内容分类下参与','discovery','common','eye','categories',2,false,40),
  ('EXPLORER',      '探索者','在 5 个内容分类下参与','discovery','common','map','categories',5,false,41),
  ('ALL_FIELDS',    '全领域探索','覆盖全部 7 个内容分类','discovery','epic','globe','categories',7,false,42),
  ('OLD_DIGGER',    '旧帖考古','参与 3 篇发布 90 天以上的主题','discovery','rare','archive','old_posts',3,false,43),
  ('COLD_FINDER',   '冷门发现者','让 3 篇长期无人讨论的主题重新被看见','discovery','epic','search','cold_posts',3,false,44),
  ('EARLY_RESIDENT','早期居民','在论坛早期阶段注册并有效参与','identity','epic','flag','early_resident',1,false,50),
  ('NIGHT_WANDERER','深夜漫游者','在不同日期的深夜留下有效讨论','hidden','rare','moon','night_days',3,true,60),
  ('TIME_TRAVELER', '时间旅行者','找到并参与一篇 120 天以上的主题','hidden','epic','clock','old_thread',1,true,61),
  ('ICEBREAKER',    '破冰者','让一篇沉寂已久的主题重新获得讨论','hidden','epic','flame','revived_thread',1,true,62)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description,
  category=EXCLUDED.category, rarity=EXCLUDED.rarity, icon=EXCLUDED.icon,
  condition_type=EXCLUDED.condition_type, condition_value=EXCLUDED.condition_value,
  is_hidden=EXCLUDED.is_hidden, sort_order=EXCLUDED.sort_order, is_active=TRUE;

-- ─── 5. 成就判定引擎（数据驱动，读原始事件，不依赖冗余计数列）───────────────
CREATE OR REPLACE FUNCTION public.honors_check_achievements(p_user_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  a RECORD; v_uname TEXT; v_ok BOOLEAN; v_cutoff TIMESTAMPTZ := '2026-08-31 23:59:59+08'::timestamptz;
BEGIN
  SELECT username INTO v_uname FROM public.users WHERE id = p_user_id;
  IF v_uname IS NULL THEN RETURN; END IF;

  FOR a IN SELECT * FROM public.achievements WHERE is_active LOOP
    v_ok := FALSE;
    CASE a.condition_type
      WHEN 'valid_posts' THEN
        SELECT count(*) >= a.condition_value INTO v_ok FROM public.posts
         WHERE author = v_uname AND COALESCE(is_announcement,false) = false;
      WHEN 'valid_replies' THEN
        SELECT count(*) >= a.condition_value INTO v_ok FROM public.comments WHERE author = v_uname;
      WHEN 'active_days' THEN
        SELECT active_days >= a.condition_value INTO v_ok FROM public.user_growth WHERE user_id = p_user_id;
      WHEN 'quality_posts' THEN
        SELECT count(*) >= a.condition_value INTO v_ok FROM public.posts
         WHERE author = v_uname AND length(COALESCE(content,'')) >= 300;
      WHEN 'topic_posts' THEN
        SELECT count(*) >= a.condition_value INTO v_ok FROM public.posts p
         WHERE p.author = v_uname
           AND (SELECT count(*) FROM public.comments c WHERE c.post_id = p.id) >= 5;
      WHEN 'categories' THEN
        SELECT count(DISTINCT category) >= a.condition_value INTO v_ok FROM public.posts
         WHERE author = v_uname AND category IS NOT NULL;
      WHEN 'old_posts' THEN
        SELECT count(DISTINCT p.id) >= a.condition_value INTO v_ok
          FROM public.comments c JOIN public.posts p ON p.id = c.post_id
         WHERE c.author = v_uname AND p.created_at < now() - interval '90 days';
      WHEN 'cold_posts' THEN
        SELECT count(DISTINCT c.post_id) >= a.condition_value INTO v_ok
          FROM public.comments c JOIN public.posts p ON p.id = c.post_id
         WHERE c.author = v_uname AND p.created_at < now() - interval '30 days'
           AND (SELECT count(*) FROM public.comments x WHERE x.post_id = c.post_id) <= 1;
      WHEN 'early_resident' THEN
        SELECT created_at <= v_cutoff INTO v_ok FROM public.users WHERE id = p_user_id;
      WHEN 'night_days' THEN
        SELECT count(DISTINCT d) >= a.condition_value INTO v_ok FROM (
          SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS d FROM public.posts
           WHERE author = v_uname AND EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Shanghai')) >= 23
          UNION
          SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date FROM public.comments
           WHERE author = v_uname
             AND (EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Shanghai')) >= 23
                  OR EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Shanghai')) < 5)
        ) t;
      WHEN 'old_thread' THEN
        SELECT count(DISTINCT p.id) >= a.condition_value INTO v_ok
          FROM public.comments c JOIN public.posts p ON p.id = c.post_id
         WHERE c.author = v_uname AND p.created_at < now() - interval '120 days';
      WHEN 'revived_thread' THEN
        SELECT count(*) >= a.condition_value INTO v_ok
          FROM public.comments c JOIN public.posts p ON p.id = c.post_id
         WHERE c.author = v_uname AND p.created_at < c.created_at - interval '30 days'
           AND NOT EXISTS (
             SELECT 1 FROM public.comments x WHERE x.post_id = c.post_id AND x.id < c.id
               AND x.created_at > c.created_at - interval '30 days');
      ELSE v_ok := FALSE;
    END CASE;

    IF v_ok THEN
      INSERT INTO public.user_achievements(user_id, achievement_id, code)
      VALUES (p_user_id, a.id, a.code)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;
      IF FOUND THEN
        -- 荣誉通知：以 SYSTEM 官方账号发出。放在异常保护里，
        -- 即便通知表 RLS 策略变更也绝不影响计分主流程。
        BEGIN
          INSERT INTO public.notifications(user_to, user_from, type, created_at)
          VALUES (v_uname, 'SYSTEM', 'honor', now());
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

-- 精选徽章最多 3 枚（数据库约束，不只靠前端）
CREATE OR REPLACE FUNCTION public.honors_guard_featured() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_n INT;
BEGIN
  IF NEW.is_featured THEN
    SELECT count(*) INTO v_n FROM public.user_achievements
     WHERE user_id = NEW.user_id AND is_featured AND id <> NEW.id;
    IF v_n >= 3 THEN RAISE EXCEPTION '最多只能展示 3 枚精选徽章'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_honors_featured ON public.user_achievements;
CREATE TRIGGER trg_honors_featured BEFORE INSERT OR UPDATE ON public.user_achievements
  FOR EACH ROW EXECUTE FUNCTION public.honors_guard_featured();

-- ─── 6. 核心计分：幂等 + 每日上限 + 事务内更新 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.honors_award(
  p_user_id BIGINT, p_kind TEXT, p_xp INT, p_rep INT,
  p_source_id BIGINT DEFAULT NULL, p_idem TEXT DEFAULT NULL,
  p_check BOOLEAN DEFAULT TRUE
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_idem TEXT; v_cap INT; v_n INT;
  v_g public.user_growth%ROWTYPE; v_today DATE := current_date;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_g FROM public.user_growth WHERE user_id = p_user_id;
  -- opt-in：默认关闭的用户完全不产生任何积分数据
  IF NOT FOUND OR NOT v_g.honors_enabled THEN RETURN; END IF;

  v_idem := COALESCE(p_idem, p_kind || ':' || p_user_id || ':' || COALESCE(p_source_id::text,'0'));

  v_cap := CASE p_kind
    WHEN 'post' THEN 5 WHEN 'reply' THEN 20 WHEN 'recognition' THEN 20
    WHEN 'daily_first' THEN 1 ELSE 1000000 END;   -- 历史回填不套每日上限
  SELECT count(*) INTO v_n FROM public.xp_transactions
   WHERE user_id = p_user_id AND event_type = p_kind AND created_at >= v_today;
  IF v_n >= v_cap THEN RETURN; END IF;

  INSERT INTO public.xp_transactions(user_id, amount, event_type, source_id, idempotency_key)
  VALUES (p_user_id, p_xp, p_kind, p_source_id, v_idem)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;   -- 重复事件：直接忽略

  UPDATE public.user_growth SET
    total_xp        = total_xp + p_xp,
    level           = public.honors_level_for_xp(total_xp + p_xp),
    post_count      = post_count + CASE WHEN p_kind IN ('post','backfill_post') THEN 1 ELSE 0 END,
    reply_count     = reply_count + CASE WHEN p_kind IN ('reply','backfill_reply') THEN 1 ELSE 0 END,
    active_days     = active_days + CASE WHEN last_active_date IS DISTINCT FROM v_today THEN 1 ELSE 0 END,
    last_active_date = v_today,
    updated_at      = now()
  WHERE user_id = p_user_id;

  IF p_rep <> 0 THEN
    INSERT INTO public.reputation_transactions(user_id, amount, event_type, source_id, idempotency_key)
    VALUES (p_user_id, p_rep, p_kind, p_source_id, 'rep:' || v_idem)
    ON CONFLICT (idempotency_key) DO NOTHING;
    UPDATE public.user_growth SET reputation = reputation + p_rep WHERE user_id = p_user_id;
  END IF;

  IF p_check THEN PERFORM public.honors_check_achievements(p_user_id); END IF;
END;
$fn$;

-- ─── 7. 触发器：身份一律取 current_app_username()，不信任行内 author ────────
-- 发帖存在「RPC 失败回退直写」路径，NEW.author 是客户端传的，不能作为计分依据。
CREATE OR REPLACE FUNCTION public.honors_on_post() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $fn$
DECLARE v_uname TEXT; v_uid BIGINT;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL OR NEW.author IS DISTINCT FROM v_uname THEN RETURN NULL; END IF;
  SELECT id INTO v_uid FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_growth WHERE user_id = v_uid AND honors_enabled) THEN RETURN NULL; END IF;

  INSERT INTO public.community_events(user_id,event_type,target_type,target_id,payload,processed_at)
  VALUES (v_uid,'post','post',NEW.id,
          jsonb_build_object('category',NEW.category,'length',length(COALESCE(NEW.content,''))),now());
  PERFORM public.honors_award(v_uid,'post',8,0,NEW.id,'post:'||NEW.id);
  PERFORM public.honors_award(v_uid,'daily_first',5,0,NULL,'daily:'||v_uid||':'||current_date::text);
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_honors_post ON public.posts;
CREATE TRIGGER trg_honors_post AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.honors_on_post();

CREATE OR REPLACE FUNCTION public.honors_on_comment() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $fn$
DECLARE v_uname TEXT; v_uid BIGINT;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL OR NEW.author IS DISTINCT FROM v_uname THEN RETURN NULL; END IF;
  SELECT id INTO v_uid FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_growth WHERE user_id = v_uid AND honors_enabled) THEN RETURN NULL; END IF;

  INSERT INTO public.community_events(user_id,event_type,target_type,target_id,payload,processed_at)
  VALUES (v_uid,'reply','comment',NEW.id,jsonb_build_object('post_id',NEW.post_id),now());
  PERFORM public.honors_award(v_uid,'reply',2,0,NEW.id,'reply:'||NEW.id);
  PERFORM public.honors_award(v_uid,'daily_first',5,0,NULL,'daily:'||v_uid||':'||current_date::text);
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_honors_comment ON public.comments;
CREATE TRIGGER trg_honors_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.honors_on_comment();

-- ─── 8. 点赞：服务端唯一约束去重 + 认可计分（前端无需改动）─────────────────
-- 保留 RETURNS VOID 与 p_post_id 签名，utils.js 的 bumpPostCounter 原样可用。
-- 无会话时维持旧行为（仅 +likes），保证老库/匿名浏览不退化。
DROP FUNCTION IF EXISTS public.increment_likes(BIGINT);
CREATE FUNCTION public.increment_likes(p_post_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; v_author TEXT; v_uid BIGINT;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN
    UPDATE public.posts SET likes = COALESCE(likes,0) + 1 WHERE id = p_post_id;
    RETURN;
  END IF;

  INSERT INTO public.post_likes(post_id, username) VALUES (p_post_id, v_uname)
  ON CONFLICT (post_id, username) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;   -- 同一人对同一帖重复点赞：不 +1、不计分

  SELECT author INTO v_author FROM public.posts WHERE id = p_post_id;
  UPDATE public.posts SET likes = COALESCE(likes,0) + 1 WHERE id = p_post_id;

  IF v_author IS NOT NULL AND v_author <> v_uname THEN
    SELECT id INTO v_uid FROM public.users WHERE username = v_author;
    -- 作者未开启荣誉体系时 honors_award 内部直接跳过
    PERFORM public.honors_award(v_uid,'recognition',3,1,p_post_id,
                                'like:'||p_post_id||':'||v_uname);
  END IF;
END;
$fn$;

-- ─── 9. 开关 + 历史回填 ────────────────────────────────────────────────────
-- 用户在「设置 → 功能」打开时调用一次。回填只按 posts / comments 的真实历史，
-- 绝不使用 posts.likes / views（历史上可被刷），且带幂等键，重复开启不会重复加分。
CREATE OR REPLACE FUNCTION public.honors_backfill(p_user_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; r RECORD; v_days INT;
BEGIN
  SELECT username INTO v_uname FROM public.users WHERE id = p_user_id;
  IF v_uname IS NULL THEN RETURN; END IF;

  FOR r IN SELECT id FROM public.posts
            WHERE author = v_uname AND COALESCE(is_announcement,false) = false LOOP
    PERFORM public.honors_award(p_user_id,'backfill_post',8,0,r.id,'backfill:post:'||r.id,false);
  END LOOP;
  FOR r IN SELECT id FROM public.comments WHERE author = v_uname LOOP
    PERFORM public.honors_award(p_user_id,'backfill_reply',2,0,r.id,'backfill:reply:'||r.id,false);
  END LOOP;

  SELECT count(*) INTO v_days FROM (
    SELECT created_at::date AS d FROM public.posts WHERE author = v_uname
    UNION SELECT created_at::date FROM public.comments WHERE author = v_uname
  ) t;
  UPDATE public.user_growth SET
    active_days = GREATEST(active_days, v_days),
    post_count  = (SELECT count(*) FROM public.posts WHERE author = v_uname
                    AND COALESCE(is_announcement,false) = false),
    reply_count = (SELECT count(*) FROM public.comments WHERE author = v_uname),
    updated_at  = now()
  WHERE user_id = p_user_id;

  PERFORM public.honors_check_achievements(p_user_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.honors_set_enabled(p_enabled BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; v_uid BIGINT; v_created TIMESTAMPTZ; v_was BOOLEAN;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  SELECT id, created_at INTO v_uid, v_created FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL THEN RAISE EXCEPTION '用户不存在'; END IF;

  -- 记录开启前状态：前端每次加载都会幂等调用本函数，若每次都回填会白白
  -- 反复扫描历史 posts / comments。仅在「关闭 → 开启」时回填一次。
  SELECT honors_enabled INTO v_was FROM public.user_growth WHERE user_id = v_uid;

  INSERT INTO public.user_growth(user_id, username, honors_enabled, joined_at)
  VALUES (v_uid, v_uname, COALESCE(p_enabled,false), COALESCE(v_created, now()))
  ON CONFLICT (user_id) DO UPDATE SET
    honors_enabled = EXCLUDED.honors_enabled,
    username = EXCLUDED.username, updated_at = now();

  IF COALESCE(p_enabled,false) AND NOT COALESCE(v_was,false)
    THEN PERFORM public.honors_backfill(v_uid);
  END IF;
  RETURN jsonb_build_object('ok',true,'enabled',COALESCE(p_enabled,false));
END;
$fn$;

-- 精选徽章（前端调用，服务端校验 3 枚上限由触发器保证）
CREATE OR REPLACE FUNCTION public.honors_set_featured(p_code TEXT, p_featured BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; v_uid BIGINT;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  SELECT id INTO v_uid FROM public.users WHERE username = v_uname;
  UPDATE public.user_achievements SET is_featured = COALESCE(p_featured,false)
   WHERE user_id = v_uid AND code = p_code;
END;
$fn$;

-- ─── 10. 删帖：按「等级不主动降级」原则只标记，不追扣 ──────────────────────
-- 保留 source_id 幂等键，避免「发了删、删了再发」重复刷分。
CREATE OR REPLACE FUNCTION public.honors_on_post_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $fn$
BEGIN
  UPDATE public.xp_transactions SET reversed = TRUE
   WHERE source_id = OLD.id AND event_type IN ('post','backfill_post');
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_honors_post_delete ON public.posts;
CREATE TRIGGER trg_honors_post_delete AFTER DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.honors_on_post_delete();

-- ─── 11. 显式函数授权 ───────────────────────────────────────────────────────
-- increment_likes 在第 8 段被 DROP 后重建，原有 GRANT 会随旧函数一起消失；
-- 各 honors_* RPC 也需要显式授权，避免项目默认权限不同导致前端 403。
-- Postgres 新函数默认给 PUBLIC EXECUTE，这里再显式授一次，纯增量、可重复执行。
GRANT EXECUTE ON FUNCTION public.increment_likes(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_set_enabled(BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_set_featured(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_level_for_xp(BIGINT) TO anon, authenticated;

-- 通知 PostgREST 立即刷新 schema cache，避免新表/新视图短暂 404
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 执行后自检（可单独跑）：
--   SELECT count(*) FROM public.achievements;                    -- 应为 20
--   SELECT count(*) FROM public.user_growth WHERE honors_enabled;-- 应为 0（默认关闭）
--   SELECT proname FROM pg_proc WHERE proname LIKE 'honors_%';   -- 计分/判定函数
-- ============================================================================
