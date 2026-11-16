import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../supabase";
import { useAuth } from "./AuthContext";
import { HONORS_KEY, HONORS_SEEN_KEY, ACHIEVEMENT_MAP } from "../honors";

// STG HONORS v13：成就系统进入灰度测试 = 默认全量开启。
// 只有用户在「设置 → 功能」里明确关掉（本地存 "0"）才停用；停用时仍会通知服务端
// 停止计分，且不发出任何荣誉数据请求。服务端未迁移时 ready=false，UI 只降级为提示。

const HonorsContext = createContext(null);

const EMPTY = {
  enabled: true, ready: null, loading: false, myGrowth: null, profiles: {},
  growthOf: () => null, badgesOf: () => [], featuredInfoOf: () => [],
  unlocked: [], unlockedCodes: new Set(),
  featuredCodes: new Set(), holderCounts: {}, xpLog: [], toast: null,
  refresh: () => {}, setEnabled: () => {}, setFeatured: () => {}, dismissToast: () => {},
};

export function useHonors() {
  return useContext(HonorsContext) || EMPTY;
}

function readLocal() {
  // 默认开启；只有显式写入 "0" 才是用户主动关闭。
  try { return localStorage.getItem(HONORS_KEY) !== "0"; } catch { return true; }
}

export function HonorsProvider({ children }) {
  const { user } = useAuth();
  const uname = user?.username || "";
  const [enabled, setEnabledState] = useState(readLocal);
  const [ready, setReady] = useState(null);       // null 未探测 / true 已就绪 / false 未迁移
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState({});   // username -> 公开档案
  const [featuredMap, setFeaturedMap] = useState({}); // user_id -> [code]
  const [holderCounts, setHolderCounts] = useState({}); // code -> 全站解锁人数（公开数据）
  const [unlocked, setUnlocked] = useState([]);   // 本人已解锁
  const [xpLog, setXpLog] = useState([]);
  const [toast, setToast] = useState(null);
  const prevEnabled = useRef(enabled);
  const refreshTimer = useRef(null);

  const clear = useCallback(() => {
    setProfiles({}); setFeaturedMap({}); setHolderCounts({});
    setUnlocked([]); setXpLog([]);
    setToast(null); setReady(null); setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: pub, error: e1 } = await supabase
        .from("honors_public_profiles")
        .select("user_id,username,total_xp,level,reputation,active_days,post_count,reply_count,honors_enabled,joined_at")
        .limit(1000);
      if (e1) { setReady(false); setLoading(false); return; }
      setReady(true);

      const map = {};
      (pub || []).forEach((r) => { map[r.username] = r; });
      setProfiles(map);
      const mine = uname ? map[uname] : null;

      // 精选徽章只拉 is_featured 行：全表拉取会被 PostgREST 默认 1000 行上限截断
      const { data: feat } = await supabase
        .from("user_achievements")
        .select("user_id,code,unlocked_at,is_featured")
        .eq("is_featured", true).limit(1000);
      // 保留整行（含 unlocked_at），主页悬浮展签需要真实解锁日期；
      // 对外接口仍然只把 code 暴露给原有调用方。
      const fmap = {};
      (feat || []).forEach((r) => { (fmap[r.user_id] = fmap[r.user_id] || []).push(r); });
      setFeaturedMap(fmap);

      // 全站解锁人数：user_achievements 公开可读，只取 code 一列，用于详情页的真实社交证明。
      // 不写死百分比，也不推算不存在的列；超过 PostgREST 上限时显示的是保守下限。
      const { data: holders } = await supabase
        .from("user_achievements").select("code").limit(1000);
      const hc = {};
      (holders || []).forEach((r) => { if (r && r.code) hc[r.code] = (hc[r.code] || 0) + 1; });
      setHolderCounts(hc);

      const { data: mineUa } = mine
        ? await supabase.from("user_achievements")
            .select("user_id,code,unlocked_at,is_featured")
            .eq("user_id", mine.user_id).limit(200)
        : { data: [] };
      // 再按 user_id 过滤一次：即便服务端过滤失效或返回了额外行，
      // 也绝不会把别人的徽章算进「我已解锁」。
      const myList = mine
        ? (mineUa || []).filter((r) => String(r.user_id) === String(mine.user_id))
        : [];
      setUnlocked(myList);

      // 成长账本：RLS 只允许本人读取，无需也不允许传他人的 user_id
      const { data: log } = await supabase
        .from("xp_transactions")
        .select("amount,event_type,created_at,reversed")
        .order("created_at", { ascending: false })
        .limit(40);
      setXpLog(log || []);

      // 解锁提示：首次开启只记录基线，不弹一堆历史徽章。
      // 基线用 "0"，任何 ISO 时间戳都大于它，因此之后新解锁的第 1 枚也能提示。
      try {
        const latest = myList.reduce((m, r) => (String(r.unlocked_at) > m ? String(r.unlocked_at) : m), "");
        const seen = localStorage.getItem(HONORS_SEEN_KEY);
        if (seen === null) {
          localStorage.setItem(HONORS_SEEN_KEY, latest || "0");
        } else if (latest && latest > seen) {
          const newest = myList.find((r) => String(r.unlocked_at) === latest);
          if (newest) setToast(ACHIEVEMENT_MAP[newest.code] || null);
          localStorage.setItem(HONORS_SEEN_KEY, latest);
        }
      } catch {}
    } catch {
      setReady(false);
    }
    setLoading(false);
  }, [uname]);

  // 灰度默认开启：登录后自动调用 honors_set_enabled(true) 建档（服务端幂等，
  // 仅 false→true 时回填）。用户主动关闭时同样通知服务端停止计分并清空本地缓存。
  useEffect(() => {
    const prev = prevEnabled.current;
    prevEnabled.current = enabled;

    if (!enabled) {
      clear();
      if (prev && uname) {
        // supabase.rpc() 返回的是惰性 thenable，必须显式触发才会发出请求；
        // 它不提供 .catch()，用 .then(_, _) 同时保证执行与吞掉失败。
        try { supabase.rpc("honors_set_enabled", { p_enabled: false }).then(() => {}, () => {}); } catch {}
      }
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (uname) {
          // 幂等：迁移里仅在 false→true 时回填，重复加载只做一次轻量 UPSERT
          const { error } = await supabase.rpc("honors_set_enabled", { p_enabled: true });
          if (error) { if (!cancelled) { setReady(false); setLoading(false); } return; }
        }
        if (!cancelled) await refresh();
      } catch {
        if (!cancelled) { setReady(false); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, uname, refresh, clear]);

  // 发帖 / 点赞后由界面派发事件，或切回标签页时做一次去抖刷新
  useEffect(() => {
    if (!enabled) return;
    const onActivity = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refresh(), 900);
    };
    const onVisible = () => { if (document.visibilityState === "visible") onActivity(); };
    window.addEventListener("stgblog:honors-activity", onActivity);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(refreshTimer.current);
      window.removeEventListener("stgblog:honors-activity", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  // 只改本地偏好，服务端同步统一交给上面的 effect，避免打开时重复调用 RPC。
  // 关闭必须持久化 "0"，否则下次刷新会按「默认开启」又把功能打开。
  const setEnabled = useCallback((v) => {
    const next = !!v;
    setEnabledState(next);
    try {
      if (next) {
        localStorage.setItem(HONORS_KEY, "1");
      } else {
        localStorage.setItem(HONORS_KEY, "0");
        localStorage.removeItem(HONORS_SEEN_KEY);
      }
    } catch {}
  }, []);

  const setFeatured = useCallback(async (code, featured) => {
    try {
      const { error } = await supabase.rpc("honors_set_featured", { p_code: code, p_featured: featured });
      if (error) return String(error.message || "操作失败，请稍后重试");
      await refresh();
      return null;
    } catch { return "操作失败，请稍后重试"; }
  }, [refresh]);

  const value = useMemo(() => ({
    enabled, setEnabled, ready, loading, refresh, profiles,
    myGrowth: uname ? profiles[uname] || null : null,
    growthOf: (name) => profiles[name] || null,
    badgesOf: (name) => {
      const p = profiles[name];
      return p ? (featuredMap[p.user_id] || []).slice(0, 5).map((r) => r.code) : [];
    },
    featuredInfoOf: (name) => {
      const p = profiles[name];
      return p ? (featuredMap[p.user_id] || []).slice(0, 5) : [];
    },
    unlocked,
    unlockedCodes: new Set(unlocked.map((r) => r.code)),
    featuredCodes: new Set(unlocked.filter((r) => r.is_featured).map((r) => r.code)),
    holderCounts, xpLog, toast, dismissToast: () => setToast(null), setFeatured,
  }), [enabled, setEnabled, ready, loading, refresh, profiles, featuredMap,
       holderCounts, unlocked, xpLog, toast, uname, setFeatured]);


  return <HonorsContext.Provider value={value}>{children}</HonorsContext.Provider>;
}
