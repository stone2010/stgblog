import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { useAuth } from "./AuthContext";
import { VERIFY_GOAL, POW_BATCH_MS, quotaMessage } from "../growth";

// v13 统一状态层：经验任务 / 真人认证计算 / 头像背景 / 管理员 / 公开身份。
// 设计原则：
//   · 服务端未执行 v13 迁移时 ready=false，所有新 UI 降级为提示，站点其余功能不受影响；
//   · 等级、管理员、认证、限额一律读服务端 growth_state()，绝不信任 localStorage；
//   · 计算跑在独立 Web Worker，主线程只负责每 30 秒把凭证交给 Postgres 复验结算。

const GrowthContext = createContext(null);

const EMPTY = {
  ready: null, loading: false, state: null, error: "",
  refresh: () => {}, signin: async () => ({ error: "服务未就绪" }),
  setImage: async () => ({ error: "服务未就绪" }),
  identityOf: () => null, imagesOf: () => ({}),
  admin: { overview: null, load: async () => {}, act: async () => ({ error: "服务未就绪" }) },
  verify: {
    running: false, computed: 0, progress: 0, seconds: 0,
    error: "", toggle: () => {}, start: () => {}, stop: () => {},
  },
  quotaMessage,
};

export function useGrowth() {
  return useContext(GrowthContext) || EMPTY;
}

function isMissingRpc(err) {
  const m = String(err?.message || err || "");
  return /schema cache|PGRST202|does not exist|Could not find|function .* not found|404|42704|42P01|column .* does not exist/i.test(m);
}

export function GrowthProvider({ children }) {
  const { user } = useAuth();
  const uname = user?.username || "";
  const [ready, setReady] = useState(null);   // null 探测中 / true 已迁移 / false 未迁移
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [identities, setIdentities] = useState({});  // username -> {level,is_admin,is_verified}
  const [images, setImages] = useState({});          // username -> {avatar_url,banner_url}
  const [overview, setOverview] = useState(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [verifyComputed, setVerifyComputed] = useState(0);
  const [verifyError, setVerifyError] = useState("");

  const workerRef = useRef(null);
  const timerRef = useRef(null);
  const pendingRef = useRef([]);
  const challengeRef = useRef(null);
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!uname) { setState(null); return; }
    setLoading(true);
    try {
      const { data, error: e } = await supabase.rpc("growth_state");
      if (e) {
        if (isMissingRpc(e)) setReady(false);
        else { setReady(true); setError(String(e.message || "同步失败")); }
        setLoading(false);
        return;
      }
      setReady(true);
      setError("");
      if (data && data.ok) setState(data);
    } catch (e) {
      setReady(false);
    }
    setLoading(false);
  }, [uname]);

  // 公开身份 + 头像背景：无论荣誉开关是否打开，都要让每个人的 Lv / 认证标识可见
  const loadPublic = useCallback(async () => {
    try {
      const { data: profs } = await supabase
        .from("honors_public_profiles")
        .select("username,level,is_admin,is_verified").limit(1000);
      const map = {};
      (profs || []).forEach((r) => { if (r && r.username) map[r.username] = r; });
      setIdentities(map);
    } catch { /* v13 未执行时该视图可能缺列，忽略即可 */ }
    try {
      const { data: us } = await supabase
        .from("users").select("username,avatar_url,banner_url").limit(500);
      const im = {};
      (us || []).forEach((r) => {
        if (r && r.username) im[r.username] = { avatar_url: r.avatar_url, banner_url: r.banner_url };
      });
      setImages(im);
    } catch { /* 列级授权未开放时忽略 */ }
  }, []);

  useEffect(() => {
    setReady(null); setState(null); setOverview(null);
    if (!uname) return;
    refresh();
    loadPublic();
  }, [uname, refresh, loadPublic]);

  // 发帖 / 点赞 / 签到后由界面派发一次去抖刷新
  useEffect(() => {
    if (!uname) return;
    let t = null;
    const onActivity = () => { clearTimeout(t); t = setTimeout(refresh, 900); };
    window.addEventListener("stgblog:growth-activity", onActivity);
    window.addEventListener("stgblog:honors-activity", onActivity);
    return () => {
      clearTimeout(t);
      window.removeEventListener("stgblog:growth-activity", onActivity);
      window.removeEventListener("stgblog:honors-activity", onActivity);
    };
  }, [uname, refresh]);

  const signin = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.rpc("growth_signin");
      if (e) return { error: String(e.message || "签到失败，请稍后再试") };
      await refresh();
      return { ok: true, ...(data || {}) };
    } catch (e) { return { error: String(e?.message || "签到失败") }; }
  }, [refresh]);

  const setImage = useCallback(async (kind, dataUrl) => {
    try {
      const { error: e } = await supabase.rpc("growth_set_image", { p_kind: kind, p_data: dataUrl });
      if (e) return { error: String(e.message || "上传失败") };
      await refresh();
      await loadPublic();
      return { ok: true };
    } catch (e) { return { error: String(e?.message || "上传失败") }; }
  }, [refresh, loadPublic]);

  const adminLoad = useCallback(async () => {
    if (ready !== true || !state?.is_admin) return;
    try {
      const { data, error: e } = await supabase.rpc("admin_overview");
      if (!e && data && data.ok) setOverview(data);
    } catch { /* 管理员接口不可用时保持空态 */ }
  }, [ready, state?.is_admin]);

  useEffect(() => { adminLoad(); }, [adminLoad]);

  const adminAct = useCallback(async (fn, args) => {
    try {
      const { data, error: e } = await supabase.rpc(fn, args);
      if (e) return { error: String(e.message || "操作失败") };
      await adminLoad();
      await refresh();
      // 把 RPC 返回值透出：加精要知道发了多少 XP，发经验要知道发放后的等级
      return { ok: true, data: data || null };
    } catch (e) { return { error: String(e?.message || "操作失败") }; }
  }, [adminLoad, refresh]);

  // ─── 真人认证：Web Worker 计算反垃圾凭证，服务端计时结算 ───────────────────
  const stopVerify = useCallback(() => {
    runningRef.current = false;
    setVerifyRunning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const w = workerRef.current;
    if (w) {
      try { w.postMessage({ type: "stop" }); } catch {}
      setTimeout(() => { try { w.terminate(); } catch {} }, 120);
      workerRef.current = null;
    }
    pendingRef.current = [];
    challengeRef.current = null;
  }, []);

  const submitBatch = useCallback(async () => {
    if (!runningRef.current || !challengeRef.current) return;
    const batch = pendingRef.current.splice(0, 128);
    if (!batch.length) return;
    try {
      const { data, error: e } = await supabase.rpc("growth_pow_submit", {
        p_challenge_id: challengeRef.current, p_stamps: batch,
      });
      if (e) {
        const msg = String(e.message || "");
        if (/结束|重新开始/.test(msg)) {
          // 挑战过期：换新 seed 继续，不打断用户
          const { data: c } = await supabase.rpc("growth_pow_start");
          if (c && c.challenge_id) {
            // 旧 seed 的凭证对新挑战无效，必须先丢弃再让 Worker 换种子
            pendingRef.current = [];
            challengeRef.current = c.challenge_id;
            workerRef.current?.postMessage({ type: "start", seed: c.seed, zeros: c.zeros || 4 });
          }
        } else if (!/太早|请稍|too_soon|15/.test(msg)) {
          setVerifyError(msg);
        }
        return;
      }
      setVerifyError("");
      if (data && data.ok) {
        await refresh();
      }
    } catch (e) {
      setVerifyError(String(e?.message || "结算失败"));
    }
  }, [refresh]);

  const startVerify = useCallback(async () => {
    if (runningRef.current || !uname || ready !== true) return;
    setVerifyError("");
    let c;
    try {
      const { data, error: e } = await supabase.rpc("growth_pow_start");
      if (e) { setVerifyError(String(e.message || "无法启动计算任务")); return; }
      c = data;
    } catch (e) { setVerifyError("无法启动计算任务"); return; }
    if (!c || !c.challenge_id) { setVerifyError("服务端未返回计算任务"); return; }

    challengeRef.current = c.challenge_id;
    pendingRef.current = [];
    setVerifyComputed(0);

    let w;
    try {
      w = new Worker(new URL("../workers/pow.worker.js", import.meta.url), { type: "module" });
    } catch {
      setVerifyError("当前浏览器不支持后台计算（Web Worker）");
      return;
    }
    workerRef.current = w;
    runningRef.current = true;
    setVerifyRunning(true);

    w.onmessage = (ev) => {
      const m = ev.data || {};
      if (m.type === "batch") {
        setVerifyComputed(m.computed || 0);
        if (m.stamps?.length) {
          // 只保留最近 128 条，避免长时间挂机撑爆内存
          pendingRef.current = pendingRef.current.concat(m.stamps).slice(-128);
        }
      }
    };
    w.onerror = () => { setVerifyError("计算线程异常，已停止"); stopVerify(); };

    w.postMessage({ type: "start", seed: c.seed, zeros: c.zeros || 4 });
    timerRef.current = setInterval(submitBatch, POW_BATCH_MS);
  }, [uname, ready, submitBatch, stopVerify]);

  useEffect(() => () => stopVerify(), [stopVerify]);

  // 已认证后自动停止，别继续白烧电
  useEffect(() => {
    if (state?.is_verified && runningRef.current) stopVerify();
  }, [state?.is_verified, stopVerify]);

  const toggleVerify = useCallback(() => {
    if (runningRef.current) stopVerify(); else startVerify();
  }, [startVerify, stopVerify]);

  const identityOf = useCallback((name) => identities[name] || null, [identities]);
  const imagesOf = useCallback((name) => images[name] || {}, [images]);

  const seconds = Number(state?.pow_seconds || 0);
  const value = useMemo(() => ({
    ready, loading, state, error, refresh, signin, setImage,
    identityOf, imagesOf, quotaMessage,
    admin: { overview, load: adminLoad, act: adminAct },
    verify: {
      running: verifyRunning, computed: verifyComputed, error: verifyError,
      seconds, progress: Math.min(100, Math.round((seconds / VERIFY_GOAL) * 100)),
      toggle: toggleVerify, start: startVerify, stop: stopVerify,
    },
  }), [ready, loading, state, error, refresh, signin, setImage, identityOf, imagesOf,
       overview, adminLoad, adminAct, verifyRunning, verifyComputed, verifyError,
       seconds, toggleVerify, startVerify, stopVerify]);

  return <GrowthContext.Provider value={value}>{children}</GrowthContext.Provider>;
}
