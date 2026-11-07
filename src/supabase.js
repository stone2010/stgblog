import { createClient } from "@supabase/supabase-js";

// 优先读环境变量，fallback 为默认值（本地开发 & Secrets 未配置时使用）
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://dbtdguasdbmlzpodfeht.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_skyyIapm1MfIpT5R5NcleQ_-reVf604";

// ─── 服务端会话（T1.1 兼容层）───────────────────────────────────────────
// 登录 RPC 在启用 v11 安全迁移后会下发 session_token。这里只在令牌存在时
// 注入自定义请求头；数据库侧尚未启用会话/RLS 时令牌为空，请求与旧版完全一致，
// 因此本改动不会破坏任何现有功能，迁移上线后自动切换到受保护路径。
const SESSION_KEY = "stgblog_session";

export function getSessionToken() {
  try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
}

export function setSessionToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, String(token));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

const sessionFetch = (input, init = {}) => {
  const token = getSessionToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init.headers || {});
  headers.set("x-stgblog-session", token);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: sessionFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
