import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { encryptMessage, decryptMessage } from "../crypto";

export function useDM(user, keyPair) {
  const [dmList, setDmList] = useState([]);
  const [dmTarget, setDmTarget] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmSending, setDmSending] = useState(false);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const lastCheckRef = useRef(0);

  const loadDmList = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("dm_messages").select("*")
      .or(`sender.eq.${user.username},receiver.eq.${user.username}`)
      .order("created_at", { ascending: false });
    if (!data) return;
    const conversations = {};
    data.forEach((msg) => {
      const other = msg.sender === user.username ? msg.receiver : msg.sender;
      if (!conversations[other] || new Date(msg.created_at) > new Date(conversations[other].created_at)) {
        conversations[other] = msg;
      }
    });
    setDmList(Object.entries(conversations).map(([other, last]) => ({ other, last })));
  }, [user]);

  // Poll unread DM count
  const checkUnread = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase.from("dm_messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver", user.username)
      .eq("read", false);
    setDmUnreadCount(count || 0);
  }, [user]);

  useEffect(() => {
    if (!user) { setDmUnreadCount(0); return; }
    checkUnread();
    const interval = setInterval(checkUnread, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, [user, checkUnread]);

  const loadDmMessages = useCallback(async (otherUser) => {
    if (!user || !otherUser) return;
    const { data } = await supabase.from("dm_messages").select("*")
      .or(`and(sender.eq.${user.username},receiver.eq.${otherUser}),and(sender.eq.${otherUser},receiver.eq.${user.username})`)
      .order("created_at", { ascending: true });
    if (!data) return;

    if (keyPair) {
      const decrypted = await Promise.all(data.map(async (msg) => {
        if (msg.encrypted && msg.ciphertext && msg.iv && msg.sender_pubkey) {
          try {
            const plain = await decryptMessage(msg.ciphertext, msg.iv, keyPair.privateKey, msg.sender_pubkey);
            return { ...msg, content: plain, decrypted: true };
          } catch {
            return { ...msg, content: "[加密消息 · 无法解密]", decrypted: false };
          }
        }
        return msg;
      }));
      setDmMessages(decrypted);
    } else {
      setDmMessages(data);
    }

    // Mark messages from otherUser as read
    await supabase.from("dm_messages")
      .update({ read: true })
      .eq("sender", otherUser)
      .eq("receiver", user.username)
      .eq("read", false);
    checkUnread();
  }, [user, keyPair, checkUnread]);

  const sendDm = useCallback(async (content) => {
    if (!user || !dmTarget || !content.trim()) return;
    setDmSending(true);

    const { data: recipient } = await supabase.from("users").select("pubkey").eq("username", dmTarget).maybeSingle();
    let msgData;

    if (recipient?.pubkey && keyPair) {
      try {
        const recipientPubKey = JSON.parse(recipient.pubkey);
        const { ciphertext, iv } = await encryptMessage(content, keyPair.privateKey, recipientPubKey);
        msgData = {
          sender: user.username, receiver: dmTarget,
          content, ciphertext, iv, encrypted: true,
          sender_pubkey: JSON.stringify(keyPair.publicKey),
          read: false,
        };
      } catch (e) {
        console.warn("Encryption failed, sending plain:", e);
        msgData = { sender: user.username, receiver: dmTarget, content, encrypted: false, read: false };
      }
    } else {
      msgData = { sender: user.username, receiver: dmTarget, content, encrypted: false, read: false };
    }

    const { data, error } = await supabase.from("dm_messages").insert([msgData]).select("*").single();
    if (!error) {
      setDmMessages((prev) => [...prev, { ...data, decrypted: true }]);
      loadDmList();
    }
    setDmSending(false);
    return !error;
  }, [user, dmTarget, keyPair, loadDmList]);

  // Mark a specific message as read (when recipient views it)
  const markAsRead = useCallback(async (otherUser) => {
    if (!user || !otherUser) return;
    await supabase.from("dm_messages")
      .update({ read: true })
      .eq("sender", otherUser)
      .eq("receiver", user.username)
      .eq("read", false);
    checkUnread();
  }, [user, checkUnread]);

  const openDm = useCallback(async (otherUser) => {
    setDmTarget(otherUser);
    await loadDmMessages(otherUser);
  }, [loadDmMessages]);

  const closeDm = useCallback(() => {
    setDmTarget(null);
    setDmMessages([]);
    loadDmList();
    checkUnread();
  }, [loadDmList, checkUnread]);

  return {
    dmList, dmTarget, dmMessages, dmSending, dmUnreadCount,
    loadDmList, loadDmMessages, sendDm, openDm, closeDm, markAsRead,
    setDmTarget,
  };
}
