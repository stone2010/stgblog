import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { generateHash } from "../utils";
import {
  getOrCreateKeyPair, generateKeyPair, createKeyBackup, restoreKeyBackup, parsePubkeyRecord,
} from "../crypto";

const AuthContext = createContext(null);

// ─── 主题色色板（强调色，全局 CSS 变量生效）───
export const ACCENT_COLORS = {
  green:  { label: "翠绿", accent: "#10b981", hover: "#059669", active: "#047857", light: "#34d399", dark: "#065f46" },
  blue:   { label: "远蓝", accent: "#3b82f6", hover: "#2563eb", active: "#1d4ed8", light: "#60a5fa", dark: "#1e40af" },
  violet: { label: "星紫", accent: "#8b5cf6", hover: "#7c3aed", active: "#6d28d9", light: "#a78bfa", dark: "#5b21b6" },
  pink:   { label: "樱粉", accent: "#ec4899", hover: "#db2777", active: "#be185d", light: "#f472b6", dark: "#9d174d" },
  orange: { label: "暖橙", accent: "#f97316", hover: "#ea580c", active: "#c2410c", light: "#fb923c", dark: "#9a3412" },
  cyan:   { label: "湖青", accent: "#06b6d4", hover: "#0891b2", active: "#0e7490", light: "#22d3ee", dark: "#155e75" },
};

function applyAccentColors(key) {
  const c = ACCENT_COLORS[key];
  const root = document.documentElement.style;
  if (!c || key === "green") {
    // 默认色：清除内联覆盖，交还样式表控制
    ["--accent", "--accent-hover", "--accent-active", "--accent-light", "--accent-dark", "--accent-glow", "--border-focus"]
      .forEach((v) => root.removeProperty(v));
    return;
  }
  root.setProperty("--accent", c.accent);
  root.setProperty("--accent-hover", c.hover);
  root.setProperty("--accent-active", c.active);
  root.setProperty("--accent-light", c.light);
  root.setProperty("--accent-dark", c.dark);
  root.setProperty("--accent-glow", c.accent + "1a");   // 10% 透明光晕
  root.setProperty("--border-focus", c.accent + "73");  // 45% 聚焦边框
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stgblog_user")) || null; } catch { return null; }
  });
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

  useEffect(() => {
    try {
      applyAccentColors(accentColor);
      localStorage.setItem("stgblog_accent", accentColor);
    } catch {}
  }, [accentColor]);

  // Load key pair when user changes
  useEffect(() => {
    if (!user) { setKeyPair(null); setFollowingSet(new Set()); return; }
    (async () => {
      try {
        const kp = await getOrCreateKeyPair(user.username);
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
    if (error) return { error: error.message || "注册失败" };
    const userData = data[0];
    const u = { username: userData.username, hash_id: userData.hash_id, bio: userData.bio || "" };
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("stgblog_user");
  }, []);

  const updateBio = useCallback(async (bio) => {
    if (!user) return;
    await supabase.from("users").update({ bio }).eq("username", user.username);
    const u = { ...user, bio };
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
  }, [user]);

  const follow = useCallback(async (targetUser) => {
    if (!user || targetUser === user.username) return;
    setFollowingSet((prev) => new Set([...prev, targetUser]));
    try {
      await supabase.rpc("follow_user", { p_follower: user.username, p_following: targetUser });
    } catch {
      await supabase.from("follows").insert([{ follower: user.username, following: targetUser }]);
    }
    try {
      await supabase.rpc("send_notification", {
        p_user_to: targetUser, p_user_from: user.username, p_type: "follow",
      });
    } catch {
      await supabase.from("notifications").insert([{
        user_to: targetUser, user_from: user.username, type: "follow",
      }]);
    }
  }, [user]);

  const unfollow = useCallback(async (targetUser) => {
    if (!user || targetUser === user.username) return;
    setFollowingSet((prev) => { const s = new Set(prev); s.delete(targetUser); return s; });
    await supabase.from("follows").delete().eq("follower", user.username).eq("following", targetUser);
  }, [user]);

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
    let key = dmKey;
    if (privacy === "key_required" && !key) {
      // Auto-generate DM key
      key = "DMK-" + Math.random().toString(36).slice(2, 12).toUpperCase();
      await supabase.from("users").update({ dm_privacy: privacy, dm_key: key }).eq("username", user.username);
      setDmKey(key);
    } else {
      await supabase.from("users").update({ dm_privacy: privacy }).eq("username", user.username);
    }
    setDmPrivacy(privacy);
  }, [user, dmKey]);

  const getDmKey = useCallback(() => dmKey, [dmKey]);

  return (
    <AuthContext.Provider value={{
      user, keyPair, followingSet, dmPrivacy, dmKey,
      colorMode, setColorMode, glassMode, setGlassMode, fontSize, setFontSize, accentColor, setAccentColor,
      styleMode, setStyleMode,
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
