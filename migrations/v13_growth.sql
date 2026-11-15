-- ============================================================================
-- STGBLOG v13.0 — 成长体系 / 经验任务 / 真人认证 / 图片 / 管理员模式
-- 在 Supabase Dashboard → SQL Editor 中以项目所有者身份【整段】执行。
--
-- 【执行前必读】
-- 1. 先备份（Dashboard → Database → Backups）。本脚本幂等，可重复执行。
-- 2. 依赖 v11_security.sql 与 v12_honors.sql；缺任一个会直接报错停止。
-- 3. 本次是「成就系统灰度测试 = 默认全量开启」，前端会为每位登录用户调用
--    honors_set_enabled(true)，因此执行后所有用户开始累计经验；设置里仍可关掉。
-- 4. 前端在 v13 未执行时会优雅降级：站点其余功能完全不受影响。
-- 5. 安全铁律：一切等级 / 管理员 / 认证 / 限额判断都在本文件里用
--    current_app_username() 重新取值，绝不信任 localStorage 或前端参数。
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
  IF to_regclass('public.user_growth') IS NULL THEN
    RAISE EXCEPTION '缺少 user_growth，请先执行 migrations/v12_honors.sql';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- P0 · 安全地基：堵住 v12 的核心越权口子
-- ════════════════════════════════════════════════════════════════════════════
-- v12 的 honors_award() 是 SECURITY DEFINER，但 Postgres 新函数默认
-- EXECUTE TO PUBLIC，匿名客户端可以直接 rpc('honors_award', {p_user_id, p_xp})
-- 给自己无限加经验 → LV4 上传门槛、签到、限额会全部形同虚设。
-- 所有内部计分 / 触发器函数一律从 PUBLIC / anon / authenticated 收回；
-- 它们仍可被同样以所有者身份运行的 SECURITY DEFINER 函数与触发器调用。
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.honors_award(BIGINT,TEXT,INT,INT,BIGINT,TEXT,BOOLEAN)',
    'public.honors_check_achievements(BIGINT)',
    'public.honors_backfill(BIGINT)',
    'public.honors_guard_featured()',
    'public.honors_on_post()',
    'public.honors_on_comment()',
    'public.honors_on_post_delete()'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

-- 白名单：只允许这四个对前端开放的入口（其余全部收回）
GRANT EXECUTE ON FUNCTION public.increment_likes(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_set_enabled(BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_set_featured(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.honors_level_for_xp(BIGINT) TO anon, authenticated;

-- ─── 1. 扩展列 ──────────────────────────────────────────────────────────────
ALTER TABLE public.user_growth
  ADD COLUMN IF NOT EXISTS signin_streak     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_signin_date  DATE,
  ADD COLUMN IF NOT EXISTS pow_seconds       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS banner_url        TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_banned    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason  TEXT,
  ADD COLUMN IF NOT EXISTS banned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_by   TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS banner_url  TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_by TEXT,
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ;

-- 再确认一次超管身份（v11 已设过，这里幂等重申）
UPDATE public.users SET is_admin = true WHERE username = 'Stone';

-- users 是列级授权；新列必须单独授 SELECT 才能被前端读到。
-- 写入一律走下方 SECURITY DEFINER RPC，绝不开放列级 UPDATE。
GRANT SELECT (avatar_url, banner_url, is_admin, is_banned, ban_reason)
  ON TABLE public.users TO anon, authenticated;

-- 头像 / 背景也存在 user_growth，便于「仅本人可读」的私密层；
-- 公开视图只暴露 is_verified / is_admin，图片本身通过 users 授权列读取。
CREATE OR REPLACE VIEW public.honors_public_profiles AS
SELECT g.user_id, g.username, g.total_xp, g.level, g.reputation,
       g.active_days, g.post_count, g.reply_count, g.honors_enabled, g.joined_at,
       COALESCE(g.is_verified, false) AS is_verified,
       COALESCE(u.is_admin, false)   AS is_admin
FROM public.user_growth g
LEFT JOIN public.users u ON u.id = g.user_id;
GRANT SELECT ON public.honors_public_profiles TO anon, authenticated;

-- ─── 2. 新表：签到流水 / PoW 挑战 / 反垃圾凭证 / 管理员日志 ─────────────────
CREATE TABLE IF NOT EXISTS public.daily_signins (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sign_date   DATE NOT NULL,
  streak      INT NOT NULL,
  xp          INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sign_date)
);

CREATE TABLE IF NOT EXISTS public.pow_challenges (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seed           TEXT NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_credit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_powc_user ON public.pow_challenges(user_id, issued_at DESC);

-- 「有用的计算成果」：每一条都是服务端可复验的 Hashcash 反垃圾凭证。
-- 未消费的凭证可兑换 1 次额外发帖/评论额度（见 growth_quota_guard）。
CREATE TABLE IF NOT EXISTS public.pow_stamps (
  id                BIGSERIAL PRIMARY KEY,
  challenge_id      BIGINT NOT NULL REFERENCES public.pow_challenges(id) ON DELETE CASCADE,
  user_id           BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round_no          BIGINT NOT NULL,
  nonce             BIGINT NOT NULL,
  hash              TEXT NOT NULL,
  credited_seconds  INT NOT NULL DEFAULT 0,
  consumed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, round_no)
);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON public.pow_stamps(user_id, consumed_at, created_at);

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adminlog_time ON public.admin_actions(created_at DESC);

-- 新表一律 RLS + 无表级授权：匿名客户端只能经 SECURITY DEFINER RPC 间接访问
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_signins','pow_challenges','pow_stamps','admin_actions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- ─── 3. 精选徽章上限 3 → 5（数据库约束同步）─────────────────────────────────
CREATE OR REPLACE FUNCTION public.honors_guard_featured() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_n INT;
BEGIN
  IF NEW.is_featured THEN
    SELECT count(*) INTO v_n FROM public.user_achievements
     WHERE user_id = NEW.user_id AND is_featured AND id <> NEW.id;
    IF v_n >= 5 THEN RAISE EXCEPTION '最多只能展示 5 枚精选徽章'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_honors_featured ON public.user_achievements;
CREATE TRIGGER trg_honors_featured BEFORE INSERT OR UPDATE ON public.user_achievements
  FOR EACH ROW EXECUTE FUNCTION public.honors_guard_featured();

-- ─── 4. 计分函数：补充签到 / 认证奖励类型，并重申每日上限 ────────────────────
-- 与 v12 同签名覆盖；唯一改动是 cap 表新增三类，其余逻辑保持不变。
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
  IF NOT FOUND OR NOT v_g.honors_enabled THEN RETURN; END IF;

  v_idem := COALESCE(p_idem, p_kind || ':' || p_user_id || ':' || COALESCE(p_source_id::text,'0'));
  v_cap := CASE p_kind
    WHEN 'post' THEN 5 WHEN 'reply' THEN 20 WHEN 'recognition' THEN 20
    WHEN 'daily_first' THEN 1 WHEN 'signin' THEN 1 WHEN 'signin_bonus' THEN 1
    WHEN 'verified' THEN 1 ELSE 1000000 END;
  SELECT count(*) INTO v_n FROM public.xp_transactions
   WHERE user_id = p_user_id AND event_type = p_kind AND created_at >= v_today;
  IF v_n >= v_cap THEN RETURN; END IF;

  INSERT INTO public.xp_transactions(user_id, amount, event_type, source_id, idempotency_key)
  VALUES (p_user_id, p_xp, p_kind, p_source_id, v_idem)
  ON CONFLICT (idempotency_key) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

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

-- ─── 5. 内部工具：确保成长档案存在 / 取会话用户 ─────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_ensure_user() RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; v_uid BIGINT; v_created TIMESTAMPTZ;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RETURN NULL; END IF;
  SELECT id, created_at INTO v_uid, v_created FROM public.users WHERE username = v_uname;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.user_growth(user_id, username, joined_at)
  VALUES (v_uid, v_uname, COALESCE(v_created, now()))
  ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;
  RETURN v_uid;
END;
$fn$;
REVOKE ALL ON FUNCTION public.growth_ensure_user() FROM PUBLIC, anon, authenticated;

-- ─── 6. 一次性状态读取：前端只需一个 RPC，避免多表 RLS 暴露 ─────────────────
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
    'can_upload', (g.level >= 4),
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

-- ─── 7. 每日签到：连续签到加成，服务端日期、服务端连击 ──────────────────────
CREATE OR REPLACE FUNCTION public.growth_signin() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uid BIGINT; v_uname TEXT; g RECORD;
  v_streak INT; v_xp INT; v_bonus INT := 0;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  v_uid := public.growth_ensure_user();
  SELECT * INTO g FROM public.user_growth WHERE user_id = v_uid;
  IF g.honors_enabled IS NOT TRUE THEN
    RAISE EXCEPTION '请先在「设置 → 功能」开启 STG 荣誉体系';
  END IF;
  IF g.last_signin_date = current_date THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'streak', g.signin_streak);
  END IF;

  IF g.last_signin_date = current_date - 1 THEN v_streak := g.signin_streak + 1;
  ELSE v_streak := 1; END IF;
  v_xp := 5;
  IF v_streak IN (3, 7, 14, 30) THEN v_bonus := LEAST(v_streak, 20); END IF;

  INSERT INTO public.daily_signins(user_id, sign_date, streak, xp)
  VALUES (v_uid, current_date, v_streak, v_xp + v_bonus)
  ON CONFLICT (user_id, sign_date) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true, 'streak', v_streak); END IF;

  UPDATE public.user_growth
     SET signin_streak = v_streak, last_signin_date = current_date, updated_at = now()
   WHERE user_id = v_uid;
  PERFORM public.honors_award(v_uid, 'signin', v_xp, 0, NULL,
                              'signin:' || v_uid || ':' || current_date::text);
  IF v_bonus > 0 THEN
    PERFORM public.honors_award(v_uid, 'signin_bonus', v_bonus, 0, NULL,
                                'signinbonus:' || v_uid || ':' || current_date::text);
  END IF;
  RETURN jsonb_build_object('ok', true, 'already', false, 'streak', v_streak,
                            'xp', v_xp + v_bonus);
END;
$fn$;

-- ─── 8. 真人认证：反垃圾凭证 PoW（成果有用、服务端计时、可复验）──────────────
-- 设计要点：
--   · seed 由服务端强随机生成，无法离线预计算；
--   · 客户端 Web Worker 持续计算 SHA-256(seed:round:nonce) 前导 4 个 0 的凭证；
--   · 每约 30 秒提交一批凭证，服务端逐条复验并按【服务端时间差】计入在线计算时长；
--   · 单次最多计 30 秒、最短间隔 15 秒，杜绝「秒提交刷满 1 小时」；
--   · 累计 3600 秒 → is_verified=true → 蓝色认证 + 解除每日限额；
--   · 未消费凭证可兑换额外发帖/评论额度，所以算力不是白烧。
CREATE OR REPLACE FUNCTION public.growth_pow_start() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uid BIGINT; v_id BIGINT; v_seed TEXT; v_now TIMESTAMPTZ := now();
BEGIN
  v_uid := public.growth_ensure_user();
  IF v_uid IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  UPDATE public.pow_challenges SET closed = true
   WHERE user_id = v_uid AND NOT closed AND issued_at < v_now - interval '6 hours';
  v_seed := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.pow_challenges(user_id, seed, issued_at, last_credit_at)
  VALUES (v_uid, v_seed, v_now, v_now) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'challenge_id', v_id, 'seed', v_seed,
                            'zeros', 4, 'issued_at', v_now);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.growth_pow_submit(
  p_challenge_id BIGINT, p_stamps JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uid BIGINT; c RECORD; r RECORD;
  v_valid INT := 0; v_credit INT; v_total INT; v_verified BOOLEAN;
  v_hex TEXT; v_round BIGINT; v_nonce BIGINT; v_bad BOOLEAN;
BEGIN
  v_uid := public.growth_ensure_user();
  IF v_uid IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  SELECT * INTO c FROM public.pow_challenges
   WHERE id = p_challenge_id AND user_id = v_uid AND NOT closed;
  IF NOT FOUND THEN RAISE EXCEPTION '计算任务已结束，请重新开始'; END IF;
  IF jsonb_typeof(p_stamps) IS DISTINCT FROM 'array' OR jsonb_array_length(p_stamps) > 128 THEN
    RAISE EXCEPTION '凭证批次无效';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_stamps) LOOP
    -- 在异常块里只置标志，CONTINUE 放到块外，避免某些 PG 版本对
    -- 「从 EXCEPTION 子事务里跳循环」的限制；畸形凭证直接跳过而不是 500。
    v_bad := false;
    BEGIN
      v_round := (r.value->>'round')::BIGINT;
      v_nonce := (r.value->>'nonce')::BIGINT;
    EXCEPTION WHEN OTHERS THEN v_bad := true;
    END;
    IF v_bad THEN CONTINUE; END IF;
    IF v_round IS NULL OR v_nonce IS NULL OR v_round < 0 OR v_nonce < 0 THEN CONTINUE; END IF;
    v_hex := encode(digest(c.seed || ':' || v_round::text || ':' || v_nonce::text, 'sha256'), 'hex');
    IF left(v_hex, 4) <> '0000' THEN CONTINUE; END IF;
    INSERT INTO public.pow_stamps(challenge_id, user_id, round_no, nonce, hash)
    VALUES (c.id, v_uid, v_round, v_nonce, v_hex)
    ON CONFLICT (challenge_id, round_no) DO NOTHING;
    IF FOUND THEN v_valid := v_valid + 1; END IF;
  END LOOP;
  IF v_valid = 0 THEN RAISE EXCEPTION '没有有效凭证，请检查计算任务'; END IF;

  -- 服务端计时：以「上次结算 → 现在」的真实时间差记账，客户端无法伪造。
  v_credit := LEAST(GREATEST(EXTRACT(EPOCH FROM (now() - c.last_credit_at))::INT, 0), 30);
  IF v_credit < 15 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_soon', 'valid', v_valid,
                              'wait', 15 - v_credit);
  END IF;
  UPDATE public.pow_challenges SET last_credit_at = now() WHERE id = c.id;
  UPDATE public.pow_stamps SET credited_seconds = v_credit
   WHERE challenge_id = c.id AND user_id = v_uid AND credited_seconds = 0;

  UPDATE public.user_growth
     SET pow_seconds = pow_seconds + v_credit,
         is_verified = (pow_seconds + v_credit >= 3600) OR is_verified,
         verified_at = CASE WHEN pow_seconds + v_credit >= 3600 AND verified_at IS NULL
                            THEN now() ELSE verified_at END,
         updated_at = now()
   WHERE user_id = v_uid
  RETURNING pow_seconds, is_verified INTO v_total, v_verified;

  -- 认证奖励只发一次：由固定的幂等键 verified:<uid> 保证，重复提交不会重复加分
  IF v_verified THEN
    PERFORM public.honors_award(v_uid, 'verified', 50, 0, NULL, 'verified:' || v_uid);
  END IF;

  RETURN jsonb_build_object('ok', true, 'valid', v_valid, 'credited', v_credit,
                            'pow_seconds', v_total, 'is_verified', v_verified);
END;
$fn$;

-- ─── 9. 头像 / 背景：LV4 门槛由服务端判定，图片 ≤200KB 由前端压缩 + 此处复核 ─
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
  IF g.level < 4 THEN RAISE EXCEPTION '需要达到 Lv.4 才能自定义头像与主页背景'; END IF;
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

-- ─── 10. 未认证限额 + 封禁：BEFORE INSERT 触发器，前端绕不过 ────────────────
CREATE OR REPLACE FUNCTION public.growth_quota_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_uname TEXT; v_uid BIGINT; u RECORD; g RECORD;
  v_kind TEXT := TG_TABLE_NAME; v_used INT; v_base INT; v_stamp_id BIGINT;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RETURN NEW; END IF;  -- RLS 会在更外层拒绝匿名写入
  SELECT * INTO u FROM public.users WHERE username = v_uname;
  IF FOUND AND u.is_banned THEN RAISE EXCEPTION '账号已被封禁，无法发布内容'; END IF;
  IF FOUND AND u.is_admin THEN RETURN NEW; END IF;
  -- user_growth 的主键是 user_id（不是 id），这里必须用 user_id 查
  SELECT user_id INTO v_uid FROM public.user_growth WHERE username = v_uname;
  IF v_uid IS NOT NULL THEN
    SELECT is_verified INTO g FROM public.user_growth WHERE user_id = v_uid;
    IF COALESCE(g.is_verified, false) THEN RETURN NEW; END IF;
  END IF;

  IF v_kind = 'posts' THEN
    SELECT count(*) INTO v_used FROM public.posts
     WHERE author = v_uname AND created_at >= current_date
       AND COALESCE(is_announcement, false) = false;
    v_base := 3;
  ELSE
    SELECT count(*) INTO v_used FROM public.comments
     WHERE author = v_uname AND created_at >= current_date;
    v_base := 5;
  END IF;
  IF v_used < v_base THEN RETURN NEW; END IF;

  -- 超出基础额度：消耗一枚真实计算出来的反垃圾凭证，让算力「有用」。
  IF v_uid IS NOT NULL THEN
    UPDATE public.pow_stamps SET consumed_at = now()
     WHERE id = (
       SELECT id FROM public.pow_stamps
        WHERE user_id = v_uid AND consumed_at IS NULL AND created_at >= current_date
        ORDER BY id LIMIT 1)
    RETURNING id INTO v_stamp_id;
  END IF;
  IF v_stamp_id IS NULL THEN
    IF v_kind = 'posts' THEN
      RAISE EXCEPTION '未认证账号每日最多发 3 篇主题；完成真人认证或让计算任务多跑一会儿可获得额外额度';
    ELSE
      RAISE EXCEPTION '未认证账号每日最多发 5 条评论；完成真人认证或让计算任务多跑一会儿可获得额外额度';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_growth_quota_post ON public.posts;
CREATE TRIGGER trg_growth_quota_post BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.growth_quota_guard();
DROP TRIGGER IF EXISTS trg_growth_quota_comment ON public.comments;
CREATE TRIGGER trg_growth_quota_comment BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.growth_quota_guard();

-- ─── 11. 管理员模式：每个动作都重新查 users.is_admin，超管是 Stone ──────────
CREATE OR REPLACE FUNCTION public.growth_assert_admin() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_uname TEXT; v_ok BOOLEAN;
BEGIN
  v_uname := public.current_app_username();
  IF v_uname IS NULL THEN RAISE EXCEPTION '会话无效，请重新登录'; END IF;
  SELECT is_admin INTO v_ok FROM public.users WHERE username = v_uname;
  IF NOT COALESCE(v_ok, false) THEN RAISE EXCEPTION '没有管理员权限'; END IF;
  RETURN v_uname;
END;
$fn$;
REVOKE ALL ON FUNCTION public.growth_assert_admin() FROM PUBLIC, anon, authenticated;

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
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('username', username, 'is_admin', is_admin,
        'is_banned', is_banned, 'created_at', created_at) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.users ORDER BY created_at DESC LIMIT 60) q), '[]'::jsonb),
    'log', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('actor', actor, 'action', action,
        'target_id', target_id, 'created_at', created_at) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.admin_actions ORDER BY created_at DESC LIMIT 30) l), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_delete_post(p_post_id BIGINT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT; v_author TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  SELECT author INTO v_author FROM public.posts WHERE id = p_post_id;
  IF v_author IS NULL THEN RAISE EXCEPTION '帖子不存在'; END IF;
  DELETE FROM public.posts WHERE id = p_post_id;
  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, 'delete_post', 'post', p_post_id::text,
          jsonb_build_object('author', v_author));
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_feature_post(p_post_id BIGINT, p_featured BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  UPDATE public.posts SET is_featured = COALESCE(p_featured, false),
         featured_by = CASE WHEN COALESCE(p_featured,false) THEN v_actor ELSE NULL END,
         featured_at = CASE WHEN COALESCE(p_featured,false) THEN now() ELSE NULL END
   WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION '帖子不存在'; END IF;
  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, CASE WHEN COALESCE(p_featured,false) THEN 'feature_post' ELSE 'unfeature_post' END,
          'post', p_post_id::text, jsonb_build_object('featured', COALESCE(p_featured,false)));
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_username TEXT, p_banned BOOLEAN, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  IF p_username = 'Stone' THEN RAISE EXCEPTION '不能封禁超级管理员'; END IF;
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

-- 「提权」只允许超管 Stone 操作，且不能改动 Stone 自己，避免权限扩散到失控。
CREATE OR REPLACE FUNCTION public.admin_promote(p_username TEXT, p_admin BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE v_actor TEXT;
BEGIN
  v_actor := public.growth_assert_admin();
  IF v_actor <> 'Stone' THEN RAISE EXCEPTION '只有超级管理员 Stone 可以调整管理员权限'; END IF;
  IF p_username = 'Stone' THEN RAISE EXCEPTION '不能修改超级管理员自身的权限'; END IF;
  UPDATE public.users SET is_admin = COALESCE(p_admin, false) WHERE username = p_username;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  INSERT INTO public.admin_actions(actor, action, target_type, target_id, detail)
  VALUES (v_actor, CASE WHEN COALESCE(p_admin,false) THEN 'promote' ELSE 'demote' END,
          'user', p_username, jsonb_build_object('is_admin', COALESCE(p_admin,false)));
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- ─── 12. 对外授权白名单 ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.growth_state() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_signin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_pow_start() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_pow_submit(BIGINT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.growth_set_image(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_post(BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_feature_post(BIGINT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote(TEXT, BOOLEAN) TO anon, authenticated;

-- 内部函数再次兜底收回（创建/替换不会自动保留 REVOKE）
REVOKE ALL ON FUNCTION public.honors_award(BIGINT,TEXT,INT,INT,BIGINT,TEXT,BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.honors_guard_featured() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_ensure_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.growth_quota_guard() FROM PUBLIC, anon, authenticated;

-- 触发器函数不能被普通用户直接调用
REVOKE ALL ON FUNCTION public.honors_check_achievements(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.honors_backfill(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.honors_on_post() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.honors_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.honors_on_post_delete() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- 执行后自检（可单独跑）：
--   SELECT public.growth_state();
--   SELECT count(*) FROM public.achievements;                     -- 20
--   SELECT has_function_privilege('anon','public.honors_award(BIGINT,TEXT,INT,INT,BIGINT,TEXT,BOOLEAN)','EXECUTE');
--       -- 必须为 false，否则 LV4 门槛仍可被绕过
--   SELECT proname FROM pg_proc WHERE proname LIKE 'growth_%' OR proname LIKE 'admin_%';
-- ============================================================================
