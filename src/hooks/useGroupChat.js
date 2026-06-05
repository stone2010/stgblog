// Group chat hook - manages group conversations
// Tables: group_chats, group_members, group_messages
// Uses shared AES group key encrypted with each member's public key

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { getOrCreateKeyPair } from "../crypto";

// Generate a random AES key as a base64 string
function generateGroupKey() {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...key));
}

// Encrypt the group key with a member's ECDH public key
async function encryptGroupKeyForMember(groupKey, recipientPubKeyJwk, senderPrivKeyJwk) {
  const EC_PARAMS = { name: "ECDH", namedCurve: "P-256" };
  const AES_PARAMS = { name: "AES-GCM", length: 256 };
  const privKey = await crypto.subtle.importKey("jwk", senderPrivKeyJwk, EC_PARAMS, false, ["deriveBits"]);
  const pubKey = await crypto.subtle.importKey("jwk", recipientPubKeyJwk, EC_PARAMS, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: pubKey }, privKey, 256);
  const aesKey = await crypto.subtle.importKey("raw", sharedBits, AES_PARAMS, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(groupKey));
  return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(enc))), iv: btoa(String.fromCharCode(...iv)) };
}

// Decrypt the group key with our ECDH private key
async function decryptGroupKeyFromMember(ciphertext, iv, senderPubKeyJwk, myPrivKeyJwk) {
  const EC_PARAMS = { name: "ECDH", namedCurve: "P-256" };
  const AES_PARAMS = { name: "AES-GCM", length: 256 };
  const privKey = await crypto.subtle.importKey("jwk", myPrivKeyJwk, EC_PARAMS, false, ["deriveBits"]);
  const pubKey = await crypto.subtle.importKey("jwk", senderPubKeyJwk, EC_PARAMS, false, []);
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: pubKey }, privKey, 256);
  const aesKey = await crypto.subtle.importKey("raw", sharedBits, AES_PARAMS, false, ["decrypt"]);
  const encBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, aesKey, encBytes);
  return new TextDecoder().decode(dec);
}

// Encrypt message with group key
async function encryptWithGroupKey(plaintext, groupKeyB64) {
  const keyBytes = Uint8Array.from(atob(groupKeyB64), (c) => c.charCodeAt(0));
  const aesKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(plaintext));
  return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(enc))), iv: btoa(String.fromCharCode(...iv)) };
}

// Decrypt message with group key
async function decryptWithGroupKey(ciphertext, iv, groupKeyB64) {
  const keyBytes = Uint8Array.from(atob(groupKeyB64), (c) => c.charCodeAt(0));
  const aesKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const encBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, aesKey, encBytes);
  return new TextDecoder().decode(dec);
}

export function useGroupChat(user, keyPair) {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupSending, setGroupSending] = useState(false);
  const [groupKeyCache, setGroupKeyCache] = useState({});
  const groupKeyCacheRef = useRef(groupKeyCache);
  groupKeyCacheRef.current = groupKeyCache;

  const loadGroups = useCallback(async () => {
    if (!user) return;
    const { data: memberships } = await supabase.from("group_members")
      .select("group_id, role")
      .eq("username", user.username);
    if (!memberships || memberships.length === 0) { setGroups([]); return; }
    const groupIds = memberships.map((m) => m.group_id);
    const { data: chats } = await supabase.from("group_chats")
      .select("*")
      .in("id", groupIds);
    if (!chats) { setGroups([]); return; }

    // Get last message and member count for each group
    const enriched = await Promise.all(chats.map(async (chat) => {
      const { data: lastMsg } = await supabase.from("group_messages")
        .select("content, encrypted, ciphertext, sender, created_at")
        .eq("group_id", chat.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count } = await supabase.from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", chat.id);
      const membership = memberships.find((m) => m.group_id === chat.id);
      let lastMsgPreview = lastMsg ? (lastMsg.encrypted ? "🔒 加密消息" : (lastMsg.content || "")) : "";
      if (lastMsg) lastMsgPreview = `${lastMsg.sender}: ${lastMsgPreview}`;
      return { ...chat, lastMsg, lastMsgPreview, memberCount: count || 0, role: membership?.role };
    }));

    enriched.sort((a, b) => {
      const ta = a.lastMsg?.created_at || a.created_at;
      const tb = b.lastMsg?.created_at || b.created_at;
      return new Date(tb) - new Date(ta);
    });
    setGroups(enriched);
  }, [user]);

  const getGroupKey = useCallback(async (groupId) => {
    if (groupKeyCacheRef.current[groupId]) return groupKeyCacheRef.current[groupId];
    if (!user || !keyPair) return null;
    // Get our encrypted group key
    const { data: memberRow } = await supabase.from("group_members")
      .select("encrypted_key")
      .eq("group_id", groupId)
      .eq("username", user.username)
      .maybeSingle();
    if (!memberRow?.encrypted_key) return null;
    try {
      const parsed = JSON.parse(memberRow.encrypted_key);
      // The key was encrypted by the creator with our public key
      const { data: creatorRow } = await supabase.from("group_chats")
        .select("creator")
        .eq("id", groupId)
        .maybeSingle();
      if (!creatorRow) return null;
      const { data: creatorUser } = await supabase.from("users")
        .select("pubkey")
        .eq("username", creatorRow.creator)
        .maybeSingle();
      if (!creatorUser?.pubkey) return null;
      const creatorPubKey = JSON.parse(creatorUser.pubkey);
      const groupKey = await decryptGroupKeyFromMember(parsed.ciphertext, parsed.iv, creatorPubKey, keyPair.privateKey);
      setGroupKeyCache((prev) => ({ ...prev, [groupId]: groupKey }));
      return groupKey;
    } catch (e) {
      console.warn("Failed to decrypt group key:", e);
      return null;
    }
  }, [user, keyPair]);

  const createGroup = useCallback(async (name) => {
    if (!user || !keyPair) return { error: "Not logged in" };
    const inviteCode = "GRP-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const { data: chat, error: chatErr } = await supabase.from("group_chats")
      .insert([{ name, creator: user.username, invite_code: inviteCode }])
      .select("*")
      .single();
    if (chatErr || !chat) return { error: chatErr?.message || "Failed to create group" };

    // Generate group key
    const groupKey = generateGroupKey();

    // Encrypt group key with creator's public key
    const pubKeyStr = JSON.stringify(keyPair.publicKey);
    const { ciphertext, iv } = await encryptGroupKeyForMember(groupKey, keyPair.publicKey, keyPair.privateKey);

    await supabase.from("group_members")
      .insert([{
        group_id: chat.id,
        username: user.username,
        role: "admin",
        encrypted_key: JSON.stringify({ ciphertext, iv, from_pubkey: pubKeyStr }),
      }]);

    setGroupKeyCache((prev) => ({ ...prev, [chat.id]: groupKey }));
    await loadGroups();
    return { ok: true, group: chat };
  }, [user, keyPair, loadGroups]);

  const joinGroup = useCallback(async (inviteCode) => {
    if (!user || !keyPair) return { error: "Not logged in" };
    const { data: chat } = await supabase.from("group_chats")
      .select("*")
      .eq("invite_code", inviteCode.trim())
      .maybeSingle();
    if (!chat) return { error: "Invalid invite code" };

    // Check if already a member
    const { data: existing } = await supabase.from("group_members")
      .select("id")
      .eq("group_id", chat.id)
      .eq("username", user.username)
      .maybeSingle();
    if (existing) return { error: "Already a member" };

    // Get creator's public key to encrypt the group key for this new member
    const { data: creatorUser } = await supabase.from("users")
      .select("pubkey")
      .eq("username", chat.creator)
      .maybeSingle();
    if (!creatorUser?.pubkey) return { error: "Failed to get group info" };

    // We need the group key. Ask the creator's encrypted key record
    const { data: creatorMember } = await supabase.from("group_members")
      .select("encrypted_key")
      .eq("group_id", chat.id)
      .eq("username", chat.creator)
      .maybeSingle();
    if (!creatorMember?.encrypted_key) return { error: "Failed to get group key" };

    try {
      const creatorPubKey = JSON.parse(creatorUser.pubkey);
      const parsed = JSON.parse(creatorMember.encrypted_key);
      const groupKey = await decryptGroupKeyFromMember(parsed.ciphertext, parsed.iv, creatorPubKey, keyPair.privateKey);

      // Re-encrypt group key for the new member
      const { ciphertext, iv } = await encryptGroupKeyForMember(groupKey, keyPair.publicKey, keyPair.privateKey);

      await supabase.from("group_members")
        .insert([{
          group_id: chat.id,
          username: user.username,
          role: "member",
          encrypted_key: JSON.stringify({ ciphertext, iv, from_pubkey: JSON.stringify(keyPair.publicKey) }),
        }]);

      setGroupKeyCache((prev) => ({ ...prev, [chat.id]: groupKey }));
      await loadGroups();
      return { ok: true, group: chat };
    } catch (e) {
      console.error("Join group failed:", e);
      return { error: "Failed to join group" };
    }
  }, [user, keyPair, loadGroups]);

  const leaveGroup = useCallback(async (groupId) => {
    if (!user) return;
    await supabase.from("group_members").delete()
      .eq("group_id", groupId).eq("username", user.username);
    if (activeGroup?.id === groupId) setActiveGroup(null);
    setGroupKeyCache((prev) => { const n = { ...prev }; delete n[groupId]; return n; });
    await loadGroups();
  }, [user, activeGroup, loadGroups]);

  const loadGroupMessages = useCallback(async (groupId) => {
    if (!user || !groupId) return;
    const { data } = await supabase.from("group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    if (!data) { setGroupMessages([]); return; }

    const groupKey = await getGroupKey(groupId);
    const decrypted = await Promise.all(data.map(async (msg) => {
      if (msg.encrypted && msg.ciphertext && msg.iv && groupKey) {
        try {
          const plain = await decryptWithGroupKey(msg.ciphertext, msg.iv, groupKey);
          return { ...msg, content: plain, decrypted: true };
        } catch {
          return { ...msg, content: "[加密消息 · 无法解密]", decrypted: false };
        }
      }
      return { ...msg, decrypted: false };
    }));
    setGroupMessages(decrypted);
  }, [user, getGroupKey]);

  const sendGroupMessage = useCallback(async (groupId, content) => {
    if (!user || !groupId || !content.trim()) return false;
    setGroupSending(true);
    const groupKey = await getGroupKey(groupId);
    let msgData;
    if (groupKey) {
      try {
        const { ciphertext, iv } = await encryptWithGroupKey(content, groupKey);
        msgData = {
          group_id: groupId, sender: user.username,
          content: "[加密消息]", ciphertext, iv, encrypted: true,
          sender_pubkey: JSON.stringify(keyPair?.publicKey || {}),
        };
      } catch (e) {
        console.warn("Group encryption failed, sending plain:", e);
        msgData = { group_id: groupId, sender: user.username, content, encrypted: false };
      }
    } else {
      msgData = { group_id: groupId, sender: user.username, content, encrypted: false };
    }
    const { data, error } = await supabase.from("group_messages").insert([msgData]).select("*").single();
    if (!error && data) {
      setGroupMessages((prev) => [...prev, { ...data, content, decrypted: true }]);
      loadGroups();
    }
    setGroupSending(false);
    return !error;
  }, [user, keyPair, getGroupKey, loadGroups]);

  const getGroupMembers = useCallback(async (groupId) => {
    const { data } = await supabase.from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });
    setGroupMembers(data || []);
    return data || [];
  }, []);

  const kickMember = useCallback(async (groupId, username) => {
    if (!user) return;
    // Check if current user is admin
    const { data: me } = await supabase.from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("username", user.username)
      .maybeSingle();
    if (me?.role !== "admin") return;
    await supabase.from("group_members").delete()
      .eq("group_id", groupId).eq("username", username);
    await getGroupMembers(groupId);
    await loadGroups();
  }, [user, getGroupMembers, loadGroups]);

  const deleteGroup = useCallback(async (groupId) => {
    if (!user) return;
    const { data: chat } = await supabase.from("group_chats")
      .select("creator")
      .eq("id", groupId)
      .maybeSingle();
    if (chat?.creator !== user.username) return;
    await supabase.from("group_chats").delete().eq("id", groupId);
    if (activeGroup?.id === groupId) setActiveGroup(null);
    setGroupKeyCache((prev) => { const n = { ...prev }; delete n[groupId]; return n; });
    await loadGroups();
  }, [user, activeGroup, loadGroups]);

  const openGroup = useCallback(async (group) => {
    setActiveGroup(group);
    await loadGroupMessages(group.id);
    await getGroupMembers(group.id);
  }, [loadGroupMessages, getGroupMembers]);

  const closeGroup = useCallback(() => {
    setActiveGroup(null);
    setGroupMessages([]);
    setGroupMembers([]);
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (user) loadGroups();
    else { setGroups([]); setActiveGroup(null); }
  }, [user, loadGroups]);

  return {
    groups, activeGroup, groupMessages, groupMembers, groupSending,
    loadGroups, createGroup, joinGroup, leaveGroup,
    loadGroupMessages, sendGroupMessage,
    getGroupMembers, kickMember, deleteGroup,
    openGroup, closeGroup,
  };
}
