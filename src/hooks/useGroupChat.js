// Group chat hook - manages group conversations
// Tables: group_chats, group_members, group_messages
// Uses shared AES group key encrypted with each member's public key

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { getOrCreateKeyPair, parsePubkeyRecord } from "../crypto";

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

const GROUP_PAGE_SIZE = 50;

export function useGroupChat(user, keyPair) {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupSending, setGroupSending] = useState(false);
  const [groupKeyCache, setGroupKeyCache] = useState({});
  const [groupHasMore, setGroupHasMore] = useState(true);
  const [groupLoadingMore, setGroupLoadingMore] = useState(false);
  const groupKeyCacheRef = useRef(groupKeyCache);
  groupKeyCacheRef.current = groupKeyCache;
  const groupMessagesRef = useRef(groupMessages);
  groupMessagesRef.current = groupMessages;

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
      // encrypted_key 由某位成员用「自己的私钥 + 目标公钥」加密；
      // 解密需要的是【加密方的公钥】= from_pubkey，回退到创建者公钥。
      // users.pubkey 是 {pub, encPriv} 结构，必须解包成真正的 JWK。
      let senderPub = parsed.from_pubkey ? parsePubkeyRecord(parsed.from_pubkey)?.pub : null;
      if (!senderPub) {
        const { data: creatorRow } = await supabase.from("group_chats")
          .select("creator")
          .eq("id", groupId)
          .maybeSingle();
        if (!creatorRow) return null;
        const { data: creatorUser } = await supabase.from("users")
          .select("pubkey")
          .eq("username", creatorRow.creator)
          .maybeSingle();
        senderPub = parsePubkeyRecord(creatorUser?.pubkey)?.pub;
      }
      if (!senderPub) return null;
      const groupKey = await decryptGroupKeyFromMember(parsed.ciphertext, parsed.iv, senderPub, keyPair.privateKey);
      setGroupKeyCache((prev) => ({ ...prev, [groupId]: groupKey }));
      return groupKey;
    } catch (e) {
      console.warn("Failed to decrypt group key:", e);
      return null;
    }
  }, [user, keyPair]);

  const createGroup = useCallback(async (name) => {
    if (!user || !keyPair) return { error: "Not logged in" };
    // v11 RLS 下 group_chats 仅「已是成员」可读，旧写法 insert().select("*")
    // 在创建者尚未写入 group_members 时会 401，形成死锁。
    // 改为：客户端生成 48-bit 强随机 id（2^48 < Number.MAX_SAFE_INTEGER，远离 serial 序列）
    // + return=minimal 插入 → 立即写入创建者成员记录 → 成为成员后 loadGroups() 正常读到群。
    // 邀请码编码群 id，供 joinGroup 在 RLS 下直接定位，同时保留 48-bit 随机密钥防猜测。
    const idBytes = new Uint8Array(6);
    crypto.getRandomValues(idBytes);
    let groupId = 0;
    for (const b of idBytes) groupId = groupId * 256 + b;
    const codeBytes = new Uint8Array(6);
    crypto.getRandomValues(codeBytes);
    const secret = Array.from(codeBytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const inviteCode = "GRP-" + groupId.toString(16).toUpperCase().padStart(12, "0") + "-" + secret;

    const { error: chatErr } = await supabase.from("group_chats")
      .insert([{ id: groupId, name, creator: user.username, invite_code: inviteCode }]);
    if (chatErr) return { error: chatErr.message || "Failed to create group" };

    // 生成群密钥，用创建者自己的公钥加密后写入成员记录
    const groupKey = generateGroupKey();
    const pubKeyStr = JSON.stringify(keyPair.publicKey);
    let memberErr = null;
    try {
      const { ciphertext, iv } = await encryptGroupKeyForMember(groupKey, keyPair.publicKey, keyPair.privateKey);
      const res = await supabase.from("group_members").insert([{
        group_id: groupId,
        username: user.username,
        role: "admin",
        encrypted_key: JSON.stringify({ ciphertext, iv, from_pubkey: pubKeyStr }),
      }]);
      memberErr = res.error;
    } catch (e) { memberErr = e; }
    if (memberErr) {
      // 回滚，避免留下无成员的孤儿群
      await supabase.from("group_chats").delete().eq("id", groupId).eq("creator", user.username);
      return { error: memberErr.message || "Failed to join group as member" };
    }

    setGroupKeyCache((prev) => ({ ...prev, [groupId]: groupKey }));
    await loadGroups();
    // 不 select 回数据库（RLS 限制），本地构造 group 供 UI 展示邀请码
    return { ok: true, group: { id: groupId, name, creator: user.username, invite_code: inviteCode } };
  }, [user, keyPair, loadGroups]);

  const joinGroup = useCallback(async (inviteCode) => {
    if (!user || !keyPair) return { error: "Not logged in" };
    const code = String(inviteCode || "").trim().toUpperCase();

    // 新格式邀请码：GRP-<12位hex群id>-<12位hex随机密钥>
    // 群 id 直接编码在码里，避免依赖 group_chats.select("*")（RLS 下未加入者不可读）。
    let groupId = null;
    const parts = code.split("-");
    if (parts.length === 3 && parts[0] === "GRP" && /^[0-9A-F]{1,14}$/.test(parts[1])) {
      const n = parseInt(parts[1], 16);
      if (Number.isSafeInteger(n) && n > 0) groupId = n;
    }
    if (groupId === null) {
      // 兼容旧格式 / 手输码：仍尝试按邀请码查询（对已加入的群有效）
      const { data: legacy } = await supabase.from("group_chats")
        .select("*").eq("invite_code", code).maybeSingle();
      if (!legacy) return { error: "邀请码无效，请核对后重试" };
      groupId = legacy.id;
    }

    // 检查是否已是成员
    const { data: existing } = await supabase.from("group_members")
      .select("id").eq("group_id", groupId).eq("username", user.username).maybeSingle();
    if (existing) return { error: "Already a member" };

    // 先写入自己的成员记录（RLS 允许插入 username=自己），
    // 成为成员后即可读 group_chats，用来校验邀请码是否真实匹配。
    const { error: insertErr } = await supabase.from("group_members").insert([{
      group_id: groupId,
      username: user.username,
      role: "member",
      encrypted_key: null,
    }]);
    if (insertErr) return { error: insertErr.message };

    const { data: chat } = await supabase.from("group_chats")
      .select("*").eq("id", groupId).maybeSingle();
    if (!chat || String(chat.invite_code || "").toUpperCase() !== code) {
      // 校验失败 → 回滚成员记录，杜绝用猜测的 id 混入群
      await supabase.from("group_members").delete()
        .eq("group_id", groupId).eq("username", user.username);
      return { error: "邀请码无效，请核对后重试" };
    }

    // 从已有成员获取群密钥（成员身份已建立，读取不再受 RLS 阻挡）
    try {
      const { data: membersWithKey } = await supabase.from("group_members")
        .select("username, encrypted_key")
        .eq("group_id", chat.id)
        .not("encrypted_key", "is", null);

      if (membersWithKey && membersWithKey.length > 0) {
        for (const m of membersWithKey) {
          try {
            const parsed = JSON.parse(m.encrypted_key || "null");
            if (!parsed) continue;
            // 加密方公钥优先取 from_pubkey，否则回退该成员登记公钥（均需解包）
            let senderPub = parsed.from_pubkey ? parsePubkeyRecord(parsed.from_pubkey)?.pub : null;
            if (!senderPub) {
              const { data: memberUser } = await supabase.from("users")
                .select("pubkey")
                .eq("username", m.username)
                .maybeSingle();
              senderPub = parsePubkeyRecord(memberUser?.pubkey)?.pub;
            }
            if (!senderPub) continue;

            const groupKey = await decryptGroupKeyFromMember(parsed.ciphertext, parsed.iv, senderPub, keyPair.privateKey);

            const { ciphertext, iv } = await encryptGroupKeyForMember(groupKey, keyPair.publicKey, keyPair.privateKey);

            await supabase.from("group_members")
              .update({ encrypted_key: JSON.stringify({ ciphertext, iv, from_pubkey: JSON.stringify(keyPair.publicKey) }) })
              .eq("group_id", chat.id)
              .eq("username", user.username);

            setGroupKeyCache((prev) => ({ ...prev, [chat.id]: groupKey }));
            break;
          } catch (e) {
            console.warn("Failed to get group key from member", m.username, e);
            continue;
          }
        }
      }
    } catch (e) {
      console.warn("Key sharing on join failed:", e);
    }
    await loadGroups();
    return { ok: true, group: chat, needsKeyShare: true };
  }, [user, keyPair, loadGroups]);

  // Share group key with a new member (called by existing member)
  const shareGroupKey = useCallback(async (groupId, targetUsername) => {
    if (!user || !keyPair) return { error: "Not logged in" };
    // Get our encrypted group key
    const { data: myMember } = await supabase.from("group_members")
      .select("encrypted_key")
      .eq("group_id", groupId)
      .eq("username", user.username)
      .maybeSingle();
    if (!myMember?.encrypted_key) return { error: "You don't have the group key" };

    // Get target user's public key
    const { data: targetUser } = await supabase.from("users")
      .select("pubkey")
      .eq("username", targetUsername)
      .maybeSingle();
    if (!targetUser?.pubkey) return { error: "Failed to get user info" };

    try {
      const targetPubKey = parsePubkeyRecord(targetUser.pubkey)?.pub;
      if (!targetPubKey) return { error: "目标用户公钥无效" };
      // We need to decrypt the group key first
      // Our encrypted_key was encrypted by the creator with our public key
      // We need the creator's public key to do ECDH
      const { data: chat } = await supabase.from("group_chats")
        .select("creator")
        .eq("id", groupId)
        .maybeSingle();
      if (!chat) return { error: "Group not found" };

      const { data: creatorUser } = await supabase.from("users")
        .select("pubkey")
        .eq("username", chat.creator)
        .maybeSingle();
      if (!creatorUser?.pubkey) return { error: "Failed to get creator info" };

      const parsed = JSON.parse(myMember.encrypted_key);
      let senderPub = parsed.from_pubkey ? parsePubkeyRecord(parsed.from_pubkey)?.pub : null;
      if (!senderPub) senderPub = parsePubkeyRecord(creatorUser.pubkey)?.pub;
      if (!senderPub) return { error: "无法取得加密方公钥" };
      const groupKey = await decryptGroupKeyFromMember(parsed.ciphertext, parsed.iv, senderPub, keyPair.privateKey);

      // Re-encrypt for target user
      const { ciphertext, iv } = await encryptGroupKeyForMember(groupKey, targetPubKey, keyPair.privateKey);

      await supabase.from("group_members")
        .update({ encrypted_key: JSON.stringify({ ciphertext, iv, from_pubkey: JSON.stringify(keyPair.publicKey) }) })
        .eq("group_id", groupId)
        .eq("username", targetUsername);

      return { ok: true };
    } catch (e) {
      console.error("Share group key failed:", e);
      return { error: "Failed to share group key" };
    }
  }, [user, keyPair]);

  const leaveGroup = useCallback(async (groupId) => {
    if (!user) return;
    await supabase.from("group_members").delete()
      .eq("group_id", groupId).eq("username", user.username);
    if (activeGroup?.id === groupId) setActiveGroup(null);
    setGroupKeyCache((prev) => { const n = { ...prev }; delete n[groupId]; return n; });
    await loadGroups();
  }, [user, activeGroup, loadGroups]);

  const decryptGroupMessages = useCallback(async (data, groupId) => {
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
    return decrypted;
  }, [getGroupKey]);

  const loadGroupMessages = useCallback(async (groupId) => {
    if (!user || !groupId) return;
    setGroupHasMore(true);
    setGroupMessages([]);

    const { data } = await supabase.from("group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(GROUP_PAGE_SIZE);
    if (!data) { setGroupMessages([]); setGroupHasMore(false); return; }

    setGroupHasMore(data.length >= GROUP_PAGE_SIZE);

    const reversed = [...data].reverse();
    const decrypted = await decryptGroupMessages(reversed, groupId);
    setGroupMessages(decrypted);
  }, [user, decryptGroupMessages]);

  const loadMoreGroupMessages = useCallback(async () => {
    if (!user || !activeGroup || groupLoadingMore || !groupHasMore) return;
    setGroupLoadingMore(true);

    const currentMessages = groupMessagesRef.current;
    const oldestMsg = currentMessages[0];
    const { data } = await supabase.from("group_messages")
      .select("*")
      .eq("group_id", activeGroup.id)
      .order("created_at", { ascending: false })
      .limit(GROUP_PAGE_SIZE)
      .lt("created_at", oldestMsg?.created_at || new Date().toISOString());

    setGroupLoadingMore(false);

    if (!data || data.length === 0) {
      setGroupHasMore(false);
      return;
    }

    setGroupHasMore(data.length >= GROUP_PAGE_SIZE);

    const reversed = [...data].reverse();
    const decrypted = await decryptGroupMessages(reversed, activeGroup.id);
    setGroupMessages((prev) => [...decrypted, ...prev]);
  }, [user, activeGroup, groupLoadingMore, groupHasMore, decryptGroupMessages]);

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

  // Update group name (admin only)
  const updateGroupName = useCallback(async (groupId, newName) => {
    if (!user || !newName.trim()) return { error: "名称不能为空" };
    const { data: me } = await supabase.from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("username", user.username)
      .maybeSingle();
    if (me?.role !== "admin") return { error: "只有管理员可以修改群名" };
    const { error } = await supabase.from("group_chats")
      .update({ name: newName.trim() })
      .eq("id", groupId);
    if (error) return { error: error.message };
    // Update local state
    setActiveGroup((prev) => prev && prev.id === groupId ? { ...prev, name: newName.trim() } : prev);
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, name: newName.trim() } : g));
    return { ok: true };
  }, [user]);

  // Set member role (admin can promote/demote, creator can manage admins)
  const setMemberRole = useCallback(async (groupId, targetUsername, newRole) => {
    if (!user) return { error: "未登录" };
    // Check current user's role
    const { data: me } = await supabase.from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("username", user.username)
      .maybeSingle();
    if (me?.role !== "admin") return { error: "只有管理员可以修改角色" };
    // Get group info to check creator
    const { data: chat } = await supabase.from("group_chats")
      .select("creator")
      .eq("id", groupId)
      .maybeSingle();
    // Only creator can change other admins' roles
    if (chat?.creator !== user.username) {
      const { data: target } = await supabase.from("group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("username", targetUsername)
        .maybeSingle();
      if (target?.role === "admin") return { error: "只有创建者可以修改管理员角色" };
    }
    // Can't demote the creator
    if (targetUsername === chat?.creator && newRole !== "admin") {
      return { error: "不能修改创建者的角色" };
    }
    const { error } = await supabase.from("group_members")
      .update({ role: newRole })
      .eq("group_id", groupId)
      .eq("username", targetUsername);
    if (error) return { error: error.message };
    await getGroupMembers(groupId);
    return { ok: true };
  }, [user, getGroupMembers]);

  // Transfer ownership (creator only)
  const transferOwnership = useCallback(async (groupId, newCreator) => {
    if (!user) return { error: "未登录" };
    const { data: chat } = await supabase.from("group_chats")
      .select("creator")
      .eq("id", groupId)
      .maybeSingle();
    if (chat?.creator !== user.username) return { error: "只有创建者可以转让群组" };
    const { error: chatErr } = await supabase.from("group_chats")
      .update({ creator: newCreator })
      .eq("id", groupId);
    if (chatErr) return { error: chatErr.message };
    // Make new creator admin
    await supabase.from("group_members")
      .update({ role: "admin" })
      .eq("group_id", groupId)
      .eq("username", newCreator);
    setActiveGroup((prev) => prev && prev.id === groupId ? { ...prev, creator: newCreator } : prev);
    await getGroupMembers(groupId);
    await loadGroups();
    return { ok: true };
  }, [user, getGroupMembers, loadGroups]);

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
    groupHasMore, groupLoadingMore,
    loadGroups, createGroup, joinGroup, shareGroupKey, leaveGroup,
    loadGroupMessages, loadMoreGroupMessages, sendGroupMessage,
    getGroupMembers, kickMember, deleteGroup,
    openGroup, closeGroup,
    updateGroupName, setMemberRole, transferOwnership,
  };
}
