import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { generateHash } from "../utils";
import {
  getOrCreateKeyPair, generateKeyPair, createKeyBackup, restoreKeyBackup, parsePubkeyRecord,
} from "../crypto";
import { withErrorHandler } from "../utils/errorHandler";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stgblog_user")) || null; } catch { return null; }
  });
  const [keyPair, setKeyPair] = useState(null);
  const [followingSet, setFollowingSet] = useState(new Set());
const [dmPrivacy, setDmPrivacy] = useState("open");
const [dmKey, setDmKey] = useState(null);
  const [uiTheme, setUiTheme] = useState(() => {
    try { return localStorage.getItem("stgblog_ui_theme") || "cipher"; } catch { return "cipher"; }
  });

  // 保存 UI 主题到 localStorage
  useEffect(() => {
    localStorage.setItem("stgblog_ui_theme", uiTheme);
    // 应用到 document
    const auroraLink = document.getElementById("theme-aurora-css");
    if (auroraLink) {
      if (uiTheme === "aurora") {
        auroraLink.disabled = false;
        document.documentElement.classList.add("theme-aurora");
      } else {
        auroraLink.disabled = true;
        document.documentElement.classList.remove("theme-aurora");
      }
    }
  }, [uiTheme]);


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
    // 使用安全 RPC 函数，密码在服务端用 bcrypt 哈希
    const { data, error } = await withErrorHandler(async () => {
      const { data, error } = await supabase.rpc("secure_login", {
        p_username: name,
        p_password: pass,
      });
      return { data, error };
    })();
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
    const { data, error } = await withErrorHandler(async () => {
      const { data, error } = await supabase.rpc("secure_register", {
        p_username: name,
        p_password: pass,
        p_hash_id: hashId,
        p_pubkey: JSON.stringify({ pub: kp.publicKey, ...(encPriv ? { encPriv } : {}) }),
      });
      return { data, error };
    })();
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
      uiTheme, setUiTheme,
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
