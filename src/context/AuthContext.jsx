import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase, setSessionToken, getSessionToken } from "../supabase";
import { generateHash, showToast } from "../utils";
import {
  getOrCreateKeyPair, generateKeyPair, createKeyBackup, restoreKeyBackup, parsePubkeyRecord,
} from "../crypto";

const AuthContext = createContext(null);

// ─── v11 迁移后的旧会话处理 ────────────────────────────────────
// 安全脚本上线后，所有写操作都要求 session_token。旧 localStorage 里
// 只有 stgblog_user、没有 stgblog_session 的登录态会「看起来已登录、
// 实际上什么也写不了」。模块加载时统一清理，并标记需要重新登录，
// 由 App 层显示横幅 + 自动弹出登录框显式引导。
function detectStaleSession() {
  try {
    const hadUser = !!localStorage.getItem("stgblog_user");
    const hasToken = !!localStorage.getItem("stgblog_session");
    if (hadUser && !hasToken) {
      localStorage.removeItem("stgblog_user");
      return true;
    }
  } catch {}
  return false;
}
const STALE_SESSION_AT_BOOT = detectStaleSession();

// ─── 主题色色板（强调色，全局 CSS 变量生效）───
export const ACCENT_COLORS = {
  green:  { label: "翠绿", accent: "#10b981", hover: "#059669", active: "#047857", light: "#34d399", dark: "#065f46" },
  blue:   { label: "远蓝", accent: "#3b82f6", hover: "#2563eb", active: "#1d4ed8", light: "#60a5fa", dark: "#1e40af" },
  violet: { label: "星紫", accent: "#8b5cf6", hover: "#7c3aed", active: "#6d28d9", light: "#a78bfa", dark: "#5b21b6" },
  pink:   { label: "樱粉", accent: "#ec4899", hover: "#db2777", active: "#be185d", light: "#f472b6", dark: "#9d174d" },
  orange: { label: "暖橙", accent: "#f97316", hover: "#ea580c", active: "#c2410c", light: "#fb923c", dark: "#9a3412" },
  cyan:   { label: "湖青", accent: "#06b6d4", hover: "#0891b2", active: "#0e7490", light: "#22d3ee", dark: "#155e75" },
};

export const ACCENT_VARS = [
  "--accent", "--accent-hover", "--accent-active", "--accent-light", "--accent-dark",
  "--accent-glow", "--accent-soft", "--accent2", "--border-focus",
  "--gemini-gradient", "--gemini-gradient-subtle",
];

export function applyAccentColors(key) {
  const c = ACCENT_COLORS[key];
  const root = document.documentElement.style;
  // 编辑部版有自己固定的红标记设计语言；内联变量权重高于样式表，若不清除，
  // 用户在经典版选过的强调色会渗进编辑部版（表现为「主题色设置串台」）。
  // main.jsx 在 React 挂载前调用本函数，此时 data-style 尚未写入，故也读 localStorage。
  let editorial = false;
  try {
    editorial = document.documentElement.getAttribute("data-style") === "editorial" ||
      localStorage.getItem("stgblog_style") === "editorial";
  } catch {}
  if (!c || key === "green" || editorial) {
    // 默认「跟随主题」/编辑部版：清除全部内联覆盖，交还样式表控制
    ACCENT_VARS.forEach((v) => root.removeProperty(v));
    return;
  }
  root.setProperty("--accent", c.accent);
  root.setProperty("--accent-hover", c.hover);
  root.setProperty("--accent-active", c.active);
  root.setProperty("--accent-light", c.light);
  root.setProperty("--accent-dark", c.dark);
  root.setProperty("--accent-glow", c.accent + "1a");   // 10% 透明光晕
  root.setProperty("--accent-soft", c.accent + "1f");
  root.setProperty("--accent2", c.light);
  root.setProperty("--border-focus", c.accent + "73");  // 45% 聚焦边框
  root.setProperty("--gemini-gradient", `linear-gradient(135deg,${c.accent},${c.light} 55%,${c.hover})`);
  root.setProperty("--gemini-gradient-subtle", `linear-gradient(135deg,${c.accent}cc,${c.light}88,${c.hover}66)`);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stgblog_user")) || null; } catch { return null; }
  });
  // 旧会话 / 会话失效：需要显式引导用户重新登录
  const [reloginRequired, setReloginRequired] = useState(STALE_SESSION_AT_BOOT);
  // v14：服务端身份对账完成前不跑密钥同步，避免改名后旧用户名查不到 pubkey
  // 被当成「极老账户」重新生成私钥，直接破坏 E2EE。
  const [identityReady, setIdentityReady] = useState(() => {
    try { return !localStorage.getItem("stgblog_session"); } catch { return true; }
  });
  const identityBusy = useRef(false);
  const [keyPair, setKeyPair] = useState(null);
  const [followingSet, setFollowingSet] = useState(new Set());
  const [dmPrivacy, setDmPrivacy] = useState("open");
  const [dmKey, setDmKey] = useState(null);
  // ─── 界面偏好 1：颜色模式（dark=暗夜 / light=浅色），旧版"classic"见下方迁移 ───
  const [colorMode, setColorMode] = useState(() => {
    try {
      const v = localStorage.getItem("stgblog_theme");
      return v === "light" ? "light" : "dark";
    } catch { return "dark"; }
  });

  useEffect(() => {
    try {
      if (colorMode === "light") document.documentElement.setAttribute("data-theme", "light");
      else document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("stgblog_theme", colorMode);
    } catch {}
  }, [colorMode]);

  // ─── 界面偏好 2：玻璃效果（glass=液态玻璃 / classic=经典普通），与颜色模式独立 ───
  const [glassMode, setGlassMode] = useState(() => {
    try {
      const stored = localStorage.getItem("stgblog_glass");
      if (stored) return stored;
      // 旧数据迁移：三合一的 "classic" 等价于 关闭玻璃 + 深色模式
      if ((localStorage.getItem("stgblog_theme") || "") === "classic") {
        localStorage.setItem("stgblog_theme", "dark");
        return "classic";
      }
      return "glass";
    } catch { return "glass"; }
  });

  useEffect(() => {
    try {
      if (glassMode === "classic") document.documentElement.setAttribute("data-glass", "off");
      else document.documentElement.removeAttribute("data-glass");
      localStorage.setItem("stgblog_glass", glassMode);
    } catch {}
  }, [glassMode]);

  // ─── 界面偏好 3：字号（sm / md / lg）───
  const [fontSize, setFontSize] = useState(() => {
    try { return localStorage.getItem("stgblog_fontsize") || "md"; } catch { return "md"; }
  });

  // ─── 界面偏好 4：界面风格（v13 起 editorial=默认 / default=经典液态玻璃）───
  // 一次性标记：老客户端第一次升级时自动切到编辑部版；之后用户在设置里的
  // 选择（含切回经典版）永远保留。main.jsx 会在挂载前同步这个标记，避免闪帧。
  const [styleMode, setStyleMode] = useState(() => {
    try {
      const v = localStorage.getItem("stgblog_style");
      if (v === "editorial" || v === "default") {
        if (localStorage.getItem("stgblog_style_v13") === "1") return v;
        localStorage.setItem("stgblog_style_v13", "1");
        return "editorial";
      }
      localStorage.setItem("stgblog_style_v13", "1");
      return "editorial";
    } catch { return "editorial"; }
  });

  useEffect(() => {
    try {
      if (styleMode === "editorial") document.documentElement.setAttribute("data-style", "editorial");
      else document.documentElement.removeAttribute("data-style");
      localStorage.setItem("stgblog_style", styleMode);
    } catch {}
  }, [styleMode]);

  // ─── 界面偏好 5：配色主题（vintage=复古暖调 / modern=现代蓝绿），首次访问默认复古暖调 ───
  const [paletteMode, setPaletteMode] = useState(() => {
    try { return localStorage.getItem("stgblog_palette") === "modern" ? "modern" : "vintage"; } catch { return "vintage"; }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-palette", paletteMode);
      localStorage.setItem("stgblog_palette", paletteMode);
    } catch {}
  }, [paletteMode]);

  useEffect(() => {
    try {
      if (fontSize && fontSize !== "md") document.documentElement.setAttribute("data-zoom", fontSize);
      else document.documentElement.removeAttribute("data-zoom");
      localStorage.setItem("stgblog_fontsize", fontSize);
    } catch {}
  }, [fontSize]);

  // ─── 主题色（强调色自选，即时生效、按设备记忆）───
  const [accentColor, setAccentColor] = useState(() => {
    try { return localStorage.getItem("stgblog_accent") || "green"; } catch { return "green"; }
  });

  // 主题色自选：默认「跟随主题」清除内联覆盖；选具体颜色时覆盖全套
  // accent 变量，保证按钮、边框、光晕、渐变全局一致生效。
  // 依赖 styleMode：切换「编辑部版 / 经典版」时重新决定是清除还是恢复内联覆盖。
  useEffect(() => {
    try {
      applyAccentColors(accentColor);
      if (accentColor === "green") localStorage.removeItem("stgblog_accent");
      else localStorage.setItem("stgblog_accent", accentColor);
    } catch {}
  }, [accentColor, styleMode]);

  // v14：登录后/切回标签页时向服务端核对身份。服务端用户名与本地不同，
  // 说明另一台设备改过名：迁移本地密钥并在刷新后统一换用新名字。
  const reconcileIdentity = useCallback(async () => {
    if (identityBusy.current) return;
    let token = "";
    try { token = getSessionToken(); } catch { token = ""; }
    if (!token) { setIdentityReady(true); return; }
    identityBusy.current = true;
    try {
      const { data, error } = await supabase.rpc("auth_identity");
      if (error) { setIdentityReady(true); return; }
      if (!data || data.ok === false) {
        if (data?.reason === "no_session") {
          setSessionToken(null);
          try { localStorage.removeItem("stgblog_user"); } catch {}
          setUser(null);
          setReloginRequired(true);
        }
        setIdentityReady(true);
        return;
      }
      let stored = null;
      try { stored = JSON.parse(localStorage.getItem("stgblog_user") || "null"); } catch {}
      const next = {
        ...(stored || {}),
        username: data.username,
        user_no: data.user_no ?? null,
        hash_id: data.hash_id ?? stored?.hash_id ?? "",
        bio: data.bio ?? stored?.bio ?? "",
        is_admin: !!data.is_admin,
        username_changed_at: data.username_changed_at || null,
      };
      if (stored?.username && stored.username !== data.username) {
        const oldBlob = localStorage.getItem(`stgblog_keys_${stored.username}`);
        if (!oldBlob) {
          setSessionToken(null);
          try {
            localStorage.removeItem("stgblog_user");
            localStorage.removeItem("stgblog_session");
          } catch {}
          setUser(null);
          setReloginRequired(true);
          setIdentityReady(true);
          showToast(`用户名已改为 ${data.username}，请用新用户名重新登录以同步加密密钥`, 5200);
          return;
        }
        if (!localStorage.getItem(`stgblog_keys_${data.username}`)) {
          localStorage.setItem(`stgblog_keys_${data.username}`, oldBlob);
        }
        localStorage.removeItem(`stgblog_keys_${stored.username}`);
        localStorage.setItem("stgblog_user", JSON.stringify(next));
        setUser(next);
        setIdentityReady(true);
        setTimeout(() => { try { window.location.reload(); } catch {} }, 120);
        return;
      }
      const changed = !stored
        || stored.username !== next.username
        || stored.user_no !== next.user_no
        || stored.hash_id !== next.hash_id
        || stored.bio !== next.bio
        || !!stored.is_admin !== next.is_admin
        || (stored.username_changed_at || null) !== (next.username_changed_at || null);
      localStorage.setItem("stgblog_user", JSON.stringify(next));
      if (changed) setUser(next);
      setIdentityReady(true);
    } catch {
      setIdentityReady(true);
    } finally {
      identityBusy.current = false;
    }
  }, []);

  useEffect(() => {
    reconcileIdentity();
    const onVisible = () => { if (document.visibilityState === "visible") reconcileIdentity(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reconcileIdentity]);

  // Load key pair when user changes
  useEffect(() => {
    if (!user || !identityReady) { if (!user) { setKeyPair(null); setFollowingSet(new Set()); } return; }
    (async () => {
      try {
        // ─── 与服务端权威密钥对账:绝不静默生成错位私钥(否则对方发来的消息将无法解密)───
        const { data } = await supabase.from("users").select("pubkey").eq("username", user.username).maybeSingle();
        const rec = parsePubkeyRecord(data?.pubkey);
        let local = null;
        try { local = JSON.parse(localStorage.getItem(`stgblog_keys_${user.username}`)); } catch {}
        const sameJwk = (a, b) => a && b && a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y;

        if (local?.publicKey && rec?.pub) {
          if (sameJwk(local.publicKey, rec.pub)) { setKeyPair(local); return; }
          // 本地私钥与服务端公钥错位 → 丢弃本地,要求重新登录以恢复权威密钥
          localStorage.removeItem(`stgblog_keys_${user.username}`);
          localStorage.removeItem("stgblog_user");
          setUser(null);
          setReloginRequired(true);
          showToast("🔐 检测到加密密钥不同步,请重新登录以恢复(输入密码即可)");
          return;
        }
        if (rec?.encPriv) {
          // 服务端有加密备份,但本设备没有本地私钥 → 无密码无法恢复,必须重新登录
          if (user) localStorage.removeItem("stgblog_user");
          setUser(null);
          setReloginRequired(true);
          showToast("🔐 加密密钥尚未同步到本设备,请重新登录以恢复");
          return;
        }
        if (rec?.pub) {
          // 服务端有公钥但无备份(老账户)且本地无私钥:重新登录后登录流程会用密码补建备份
          localStorage.removeItem("stgblog_user");
          setUser(null);
          setReloginRequired(true);
          showToast("🔐 加密密钥需要重新登录同步,请输入密码登录");
          return;
        }
        // 服务端无任何公钥记录(异常/极老账户):沿用本地密钥并上传公钥
        const kp = await getOrCreateKeyPair(user.username);
        await supabase.from("users").update({ pubkey: JSON.stringify({ pub: kp.publicKey }) }).eq("username", user.username);
        setKeyPair(kp);
      } catch (e) { console.warn("Key pair error:", e); }
    })();
  }, [user, identityReady]);

  // Load follow data
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("follows").select("following").eq("follower", user.username);
      if (data) setFollowingSet(new Set(data.map((r) => r.following)));
    })();
  }, [user]);

  const login = useCallback(async (name, pass) => {
    // 使用安全 RPC 函数，密码在服务端用 bcrypt 验证
    const { data, error } = await supabase.rpc("secure_login", {
      p_username: name,
      p_password: pass,
    });
    if (error || !data || data.length === 0) return { error: "用户名或密码错误" };
    const userData = data[0];
    // T1.1：必须在后续任何写库操作之前保存会话令牌
    // （老账户首次登录会在密钥同步阶段写 users.pubkey 补建备份）
    setSessionToken(userData.session_token || null);

    // ─── 密钥同步（服务端权威：所有设备共用同一把备份密钥，保证跨设备互通）───
    let finalKeys;
    try {
      // 1) 先读服务端备份，不在本地提前造密钥（避免新设备凭空生成错位的私钥）
      const { data: existing } = await supabase.from("users").select("pubkey").eq("username", name).maybeSingle();
      const dbRecord = parsePubkeyRecord(existing?.pubkey);

      if (dbRecord?.encPriv) {
        // 服务端已有备份：用密码恢复，这是跨设备统一的唯一权威密钥
        const restoredPriv = await restoreKeyBackup(name, pass, dbRecord.encPriv);
        if (!restoredPriv) {
          // 恢复失败绝不能为新设备生成新密钥（否则与现有设备永久错位、互相解不开）
          // 同时回滚本轮已写入的会话令牌：否则会留下「有 token、无密钥、界面未登录」
          // 的半登录态，用户看到报错弹窗却已在本地存了有效令牌，刷新后状态错乱。
          setSessionToken(null);
          return { error: "无法用当前密码恢复端到端加密密钥，请确认密码正确后再登录" };
        }
        finalKeys = { publicKey: dbRecord.pub, privateKey: restoredPriv };
      } else {
        // 老账户（无 encPriv 备份）：才生成本地密钥并立即备份到服务端
        const localKeys = await getOrCreateKeyPair(name);
        const encPriv = await createKeyBackup(name, pass, localKeys.privateKey);
        finalKeys = localKeys;
        const dbPubStr = JSON.stringify({ pub: finalKeys.publicKey, ...(encPriv ? { encPriv } : {}) });
        await supabase.from("users").update({ pubkey: dbPubStr }).eq("username", name);
      }

      // 2) 用权威密钥覆盖本设备
      localStorage.setItem(`stgblog_keys_${name}`, JSON.stringify(finalKeys));
    } catch (e) {
      console.warn("Key sync on login failed:", e);
      // 出错时不要静默用本地密钥，避免两端私钥不一致；同样回滚会话令牌
      setSessionToken(null);
      return { error: "密钥同步失败，请重试" };
    }

    // v14：登录后补一次身份信息（user_no / is_admin）；未迁移时静默忽略。
    let ident = null;
    try {
      const { data: id } = await supabase.rpc("auth_identity");
      if (id && id.ok) ident = id;
    } catch {}
    const u = {
      username: userData.username,
      hash_id: userData.hash_id,
      bio: userData.bio || "",
      user_no: ident?.user_no ?? null,
      is_admin: !!ident?.is_admin,
      username_changed_at: ident?.username_changed_at || null,
    };
    setIdentityReady(true);
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setKeyPair(finalKeys); // 显式设置，避免依赖二次 effect 读取产生竞态
    setUser(u);
    setReloginRequired(false);
    return { ok: true };
  }, []);

  const register = useCallback(async (name, pass) => {
    const hashId = generateHash();
    const kp = await getOrCreateKeyPair(name);
    const encPriv = await createKeyBackup(name, pass, kp.privateKey);
    // 使用安全 RPC 函数，密码在服务端用 bcrypt 哈希后存储
    const { data, error } = await supabase.rpc("secure_register", {
      p_username: name,
      p_password: pass,
      p_hash_id: hashId,
      p_pubkey: JSON.stringify({ pub: kp.publicKey, ...(encPriv ? { encPriv } : {}) }),
    });
    if (error) {
      const msg = error.message || "";
      let friendly = "注册失败，请稍后重试";
      if (/用户名已存在/.test(msg)) friendly = "该用户名已被注册，换一个试试";
      else if (/保留/.test(msg)) friendly = "该用户名不可用，请换一个";
      else if (/duplicate key|unique constraint/i.test(msg)) friendly = "该用户名已被注册，换一个试试";
      else if (/过于频繁|rate/i.test(msg)) friendly = "操作过于频繁，请稍后再试";
      else if (/用户名格式/.test(msg)) friendly = "用户名格式不合法（3-20 位中英文、数字或下划线）";
      else if (/密码至少/.test(msg)) friendly = "密码至少 6 位";
      else if (/会话无效/.test(msg)) friendly = "登录状态已过期，请重新登录";
      return { error: friendly };
    }
    const userData = data[0];
    setSessionToken(userData.session_token || null);
    let ident = null;
    try {
      const { data: id } = await supabase.rpc("auth_identity");
      if (id && id.ok) ident = id;
    } catch {}
    const u = {
      username: userData.username,
      hash_id: userData.hash_id,
      bio: userData.bio || "",
      user_no: ident?.user_no ?? null,
      is_admin: !!ident?.is_admin,
      username_changed_at: ident?.username_changed_at || null,
    };
    setIdentityReady(true);
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
    setReloginRequired(false);
    return { ok: true };
  }, []);

  // v14：修改用户名。客户端先用当前密码把私钥重新包裹到新用户名下，
  // 再由服务端一次性级联所有以用户名为文本的引用。
  const changeUsername = useCallback(async (newName, password) => {
    if (!user) return { error: "请先登录" };
    const name = String(newName || "").trim();
    if (name.length < 3 || name.length > 20 || /[<>&"/;]/.test(name)) {
      return { error: "用户名需为 3–20 位，且不能包含 < > & / ; 或引号" };
    }
    if (name.toLowerCase() === String(user.username || "").toLowerCase()) {
      return { error: "新用户名不能与当前用户名相同" };
    }
    if (!password) return { error: "请输入当前密码" };
    if (!keyPair?.privateKey || !keyPair?.publicKey) {
      return { error: "加密密钥尚未同步到本设备，请重新登录后再修改用户名" };
    }
    try {
      const encPriv = await createKeyBackup(name, password, keyPair.privateKey);
      if (!encPriv) return { error: "密钥备份生成失败，请重试" };
      const newPubkey = JSON.stringify({ pub: keyPair.publicKey, encPriv });
      const { data, error } = await supabase.rpc("secure_change_username", {
        p_new_username: name,
        p_password: password,
        p_new_pubkey: newPubkey,
      });
      if (error) {
        const msg = String(error.message || "");
        if (/function|schema cache|PGRST202|does not exist|Could not find/i.test(msg)) {
          return { error: "改名功能尚未启用：请先在 Supabase 执行 migrations/v15_identity.sql" };
        }
        if (/30 天|冷却|等待/.test(msg)) return { error: msg };
        if (/密码/.test(msg)) return { error: "当前密码不正确" };
        if (/已存在|保留|格式/.test(msg)) return { error: msg };
        if (/会话无效/.test(msg)) return { error: "登录状态已过期，请重新登录" };
        return { error: msg || "修改失败，请稍后重试" };
      }
      if (!data || data.ok === false) return { error: "修改失败，请稍后重试" };
      const oldName = user.username;
      const blob = localStorage.getItem(`stgblog_keys_${oldName}`) || JSON.stringify(keyPair);
      try {
        localStorage.setItem(`stgblog_keys_${name}`, blob);
        localStorage.removeItem(`stgblog_keys_${oldName}`);
      } catch {}
      const next = {
        ...user,
        username: data.username || name,
        user_no: data.user_no ?? user.user_no ?? null,
        username_changed_at: new Date().toISOString(),
      };
      try { localStorage.setItem("stgblog_user", JSON.stringify(next)); } catch {}
      setUser(next);
      setIdentityReady(true);
      return { ok: true, username: next.username };
    } catch (e) {
      return { error: String(e?.message || "网络错误，请稍后重试") };
    }
  }, [user, keyPair]);

  const logout = useCallback(() => {
    try { supabase.rpc("logout").catch(() => {}); } catch {}
    setSessionToken(null);
    setUser(null);
    localStorage.removeItem("stgblog_user");
  }, []);

  const updateBio = useCallback(async (bio) => {
    if (!user) return;
    // U-12：写操作统一检查 error，失败不再静默假装成功
    const { error } = await supabase.from("users").update({ bio }).eq("username", user.username);
    if (error) { showToast("资料保存失败：" + (error.message || "网络错误")); return; }
    const u = { ...user, bio };
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
  }, [user]);

  const follow = useCallback(async (targetUser) => {
    if (!user || targetUser === user.username) return;
    const prevSet = followingSet;
    setFollowingSet((prev) => new Set([...prev, targetUser]));
    const { error } = await supabase.from("follows").insert([{ follower: user.username, following: targetUser }]);
    if (error) {
      setFollowingSet(prevSet); // 回滚乐观更新
      showToast("关注失败：" + (error.message || "网络错误"));
      return;
    }
    await supabase.from("notifications").insert([{
      user_to: targetUser, user_from: user.username, type: "follow",
    }]);
  }, [user, followingSet]);

  const unfollow = useCallback(async (targetUser) => {
    if (!user || targetUser === user.username) return;
    const prevSet = followingSet;
    setFollowingSet((prev) => { const s = new Set(prev); s.delete(targetUser); return s; });
    const { error } = await supabase.from("follows").delete().eq("follower", user.username).eq("following", targetUser);
    if (error) {
      setFollowingSet(prevSet);
      showToast("取消关注失败：" + (error.message || "网络错误"));
    }
  }, [user, followingSet]);

  // Load DM privacy settings
  useEffect(() => {
    if (!user) { setDmPrivacy("open"); setDmKey(null); return; }
    (async () => {
      const { data } = await supabase.from("users")
        .select("dm_privacy, dm_key")
        .eq("username", user.username)
        .maybeSingle();
      if (data) {
        setDmPrivacy(data.dm_privacy || "open");
        setDmKey(data.dm_key || null);
      }
    })();
  }, [user]);

  const updateDmPrivacy = useCallback(async (privacy) => {
    if (!user) return;
    const payload = { dm_privacy: privacy };
    let key = dmKey;
    if (privacy === "key_required" && !key) {
      // T1.5：改用 WebCrypto 强随机，不再用可预测的 Math.random()
      const bytes = new Uint8Array(9);
      crypto.getRandomValues(bytes);
      key = "DMK-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase().slice(0, 12);
      payload.dm_key = key;
    }
    // U-4：必须检查 error。旧实现在 PATCH 返回 400（dm_privacy/dm_key 列不存在）
    // 时界面仍立刻显示密钥，属于"假成功"，用户误以为已受保护。
    const { error } = await supabase.from("users").update(payload).eq("username", user.username);
    if (error) {
      showToast("私信隐私设置保存失败：" + (error.message || "服务端不支持该项"));
      return;
    }
    if (payload.dm_key) setDmKey(key);
    setDmPrivacy(privacy);
  }, [user, dmKey]);

  const getDmKey = useCallback(() => dmKey, [dmKey]);

  return (
    <AuthContext.Provider value={{
      user, keyPair, followingSet, dmPrivacy, dmKey, reloginRequired, setReloginRequired,
      identityReady,
      colorMode, setColorMode, glassMode, setGlassMode, fontSize, setFontSize, accentColor, setAccentColor,
      styleMode, setStyleMode,
      paletteMode, setPaletteMode,
      login, register, changeUsername, logout, updateBio, follow, unfollow,
      updateDmPrivacy, getDmKey,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
