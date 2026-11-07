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

// 写操作被 RLS 拒绝时统一派发事件，由界面提示「需要重新登录」，
// 避免旧会话下「点了没反应」的静默失败。
const SESSION_INVALID_EVENT = "stgblog:session-invalid";
const AUTH_RPC = /\/rpc\/(secure_login|secure_register|logout)\b/;

function notifyIfSessionInvalid(res, url, method) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return;
  if (AUTH_RPC.test(url)) return;
  if (res.status !== 401 && res.status !== 403) return;
  try {
    if (!localStorage.getItem("stgblog_user")) return; // 访客态不打扰
  } catch { return; }
  try {
    window.dispatchEvent(new CustomEvent(SESSION_INVALID_EVENT, {
      detail: { status: res.status, url },
    }));
  } catch {}
}

const sessionFetch = (input, init = {}) => {
  const token = getSessionToken();
  const url = typeof input === "string" ? input : (input && input.url) || "";
  const method = String(init.method || (input && input.method) || "GET").toUpperCase();
  if (!token) {
    // 无令牌时请求形态与旧版完全一致，只追加响应观察、不改请求
    return fetch(input, init).then((res) => {
      notifyIfSessionInvalid(res, url, method);
      return res;
    });
  }
  const headers = new Headers(init.headers || {});
  headers.set("x-stgblog-session", token);
  return fetch(input, { ...init, headers }).then((res) => {
    notifyIfSessionInvalid(res, url, method);
    return res;
  });
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: sessionFetch },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
