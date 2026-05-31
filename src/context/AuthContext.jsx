import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "../supabase";
import { generateHash } from "../utils";
import { getOrCreateKeyPair } from "../crypto";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("stgblog_user")) || null; } catch { return null; }
  });
  const [keyPair, setKeyPair] = useState(null);
  const [followingSet, setFollowingSet] = useState(new Set());

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
    const { data, error } = await supabase.from("users")
      .select("username, hash_id, pubkey, bio")
      .eq("username", name).eq("password", pass).maybeSingle();
    if (error || !data) return { error: "用户名或密码错误" };
    const u = { username: data.username, hash_id: data.hash_id, bio: data.bio || "" };
    localStorage.setItem("stgblog_user", JSON.stringify(u));
    setUser(u);
    return { ok: true };
  }, []);

  const register = useCallback(async (name, pass) => {
    const { data: ex } = await supabase.from("users").select("id").eq("username", name).maybeSingle();
    if (ex) return { error: "用户名已存在" };
    const hashId = generateHash();
    const kp = await getOrCreateKeyPair(name);
    const { data, error } = await supabase.from("users").insert([{
      username: name, password: pass, hash_id: hashId,
      pubkey: JSON.stringify(kp.publicKey), bio: "",
    }]).select("username, hash_id, pubkey, bio").single();
    if (error) return { error: error.message || "注册失败" };
    const u = { username: data.username, hash_id: data.hash_id, bio: data.bio || "" };
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
    await supabase.from("follows").insert([{ follower: user.username, following: targetUser }]);
    await supabase.from("notifications").insert([{
      user_to: targetUser, user_from: user.username, type: "follow",
    }]);
  }, [user]);

  const unfollow = useCallback(async (targetUser) => {
    if (!user || targetUser === user.username) return;
    setFollowingSet((prev) => { const s = new Set(prev); s.delete(targetUser); return s; });
    await supabase.from("follows").delete().eq("follower", user.username).eq("following", targetUser);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, keyPair, followingSet,
      login, register, logout, updateBio, follow, unfollow,
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
