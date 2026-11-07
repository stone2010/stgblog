import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase, setSessionToken } from "../supabase";
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
  if (!c || key === "green") {
    // 默认「跟随主题」：清除全部内联覆盖，交还配色主题样式表控制
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

  // ─── 界面偏好 4：界面风格（default=液态玻璃默认 / editorial=编辑部印刷风）───
  const [styleMode, setStyleMode] = useState(() => {
    try { return localStorage.getItem("stgblog_style") || "default"; } catch { return "default"; }
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
  useEffect(() => {
    try {
      applyAccentColors(accentColor);
      if (accentColor === "green") localStorage.removeItem("stgblog_accent");
      else localStorage.setItem("stgblog_accent", accentColor);
    } catch {}
  }, [accentColor]);

  // Load key pair when user changes
  useEffect(() => {
    if (!user) { setKeyPair(null); setFollowingSet(new Set()); return; }
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
  }, [user]);

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
      // 出错时不要静默用本地密钥，避免两端私钥不一致
      return { error: "密钥同步失败，请重试" };
    }

    const u = { username: userData.username, hash_id: userData.hash_id, bio: userData.bio || "" };
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
      else if (/duplicate key|unique constraint/i.test(msg)) friendly = "注册繁忙，请再试一次";
      else if (/过于频繁|rate/i.test(msg)) friendly = "操作过于频繁，请稍后再试";
      else if (/用户名格式/.test(msg)) friendly = "用户名格式不合法（3-20 位中英文、数字或下划线）";
      else if (/密码至少/.test(msg)) friendly = "密码至少 6 位";
      else if (/会话无效/.test(msg)) friendly = "登录状态已过期，请重新登录";
      return { error: friendly };
    }
    const userData = data[0];
    const u = { username: userData.username, hash_id: userData.hash_id, bio: userData.bio || "" };
    setSessionToken(userData.session_token || null);
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
    setReloginRequired(false);
    return { ok: true };
  }, []);

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
      colorMode, setColorMode, glassMode, setGlassMode, fontSize, setFontSize, accentColor, setAccentColor,
      styleMode, setStyleMode,
      paletteMode, setPaletteMode,
      login, register, logout, updateBio, follow, unfollow,
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
