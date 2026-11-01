import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { encryptMessage, decryptMessage, parsePubkeyRecord } from "../crypto";

// localStorage helpers for DM conversation cache
const CACHE_KEY = (username) => `stgblog_dm_conversations_${username}`;

function loadCachedConversations(username) {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY(username))) || [];
  } catch { return []; }
}

function saveCachedConversations(username, list) {
  try {
    localStorage.setItem(CACHE_KEY(username), JSON.stringify(list));
  } catch {}
}

const DM_PAGE_SIZE = 50;
const CHAT_POLL_MS = 4000;      // 聊天界面轮询兜底间隔
const UNREAD_POLL_MS = 12000;   // 未读计数轮询间隔

// 合并消息数组（按 id 去重，保持顺序）
function mergeMessages(prev, incoming) {
  const map = new Map();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) {
    if (m?.id != null) {
      const existing = map.get(m.id);
      map.set(m.id, existing ? { ...existing, ...m } : m);
    }
  }
  const merged = [...map.values()];
  // 按时间稳定排序，created_at 相同时保持数据库顺序 id
  merged.sort((a, b) => {
    const ta = a.created_at || "";
    const tb = b.created_at || "";
    if (ta !== tb) return String(ta) < String(tb) ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });
  return merged;
}

// 获取消息应使用的对方公钥 JWK 字符串：
// 优先用消息内保存的公钥（密钥轮换安全），否则回退到 users 表当前公钥（兼容新旧格式）
async function getPeerPubKeyStr(user, msg, otherUser) {
  const isMine = msg.sender === user.username;
  const direct = isMine ? msg.receiver_pubkey : msg.sender_pubkey;
  if (direct) return direct;
  const fallbackName = isMine ? otherUser : msg.sender;
  const { data } = await supabase.from("users").select("pubkey").eq("username", fallbackName).maybeSingle();
  const record = parsePubkeyRecord(data?.pubkey);
  return record?.pub ? JSON.stringify(record.pub) : null;
}
export function useDM(user, keyPair) {
  const [dmList, setDmList] = useState([]);
  const [dmTarget, setDmTarget] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmSending, setDmSending] = useState(false);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [dmHasMore, setDmHasMore] = useState(true);
  const [dmLoadingMore, setDmLoadingMore] = useState(false);
  const [dmLive, setDmLive] = useState(false); // realtime 是否工作，用于 UI 显示在线状态
  const dmListRef = useRef(dmList);
  dmListRef.current = dmList;
  const dmMessagesRef = useRef(dmMessages);
  dmMessagesRef.current = dmMessages;
  const dmTargetRef = useRef(dmTarget);
  dmTargetRef.current = dmTarget;
  const latestPubKeyRef = useRef({}); // username -> 最新 pubkey（避免解密时重复请求）

  const loadDmList = useCallback(async () => {
    if (!user) return;

    // 1. Show cached data instantly
    const cached = loadCachedConversations(user.username);
    if (cached.length > 0) setDmList(cached);

    // 2. Fetch latest message per conversation
    const { data, error } = await supabase.from("dm_messages").select("*")
      .or(`sender.eq.${user.username},receiver.eq.${user.username}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return;

    const conversations = {};
    data.forEach((msg) => {
      const other = msg.sender === user.username ? msg.receiver : msg.sender;
      if (!conversations[other] || new Date(msg.created_at) > new Date(conversations[other].created_at)) {
        conversations[other] = msg;
      }
    });

    // 3. Merge with locally persisted conversations
    let persisted = [];
    try { persisted = JSON.parse(localStorage.getItem(`stgblog_dm_opened_${user.username}`)) || []; } catch {}
    persisted.forEach((u) => {
      if (!conversations[u]) conversations[u] = null;
    });

    // 4. Fetch pin states
    let pinnedSet = new Set();
    try {
      const { data: pins } = await supabase.from("dm_pins").select("pinned_user").eq("username", user.username);
      if (pins) pinnedSet = new Set(pins.map((p) => p.pinned_user));
    } catch {}

    // 5. Build sorted list: pinned first, then by last message time
    const list = Object.entries(conversations)
      .map(([other, last]) => ({ other, last, pinned: pinnedSet.has(other) }))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const ta = a.last?.created_at || "1970-01-01";
        const tb = b.last?.created_at || "1970-01-01";
        return new Date(tb) - new Date(ta);
      });

    setDmList(list);
    saveCachedConversations(user.username, list);
  }, [user]);

  // Poll unread DM count（先声明，供下方其它 useCallback 引用）
  const checkUnread = useCallback(async () => {
    if (!user) return;
    try {
      const { count, error } = await supabase.from("dm_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver", user.username)
        .eq("read", false);
      if (!error) setDmUnreadCount(count || 0);
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) { setDmUnreadCount(0); return; }
    checkUnread();
    const interval = setInterval(checkUnread, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [user, checkUnread]);

  // Fetch and cache a user's current pubkey
  const fetchPubKey = useCallback(async (username) => {
    if (!username) return null;
    if (latestPubKeyRef.current[username]) return latestPubKeyRef.current[username];
    const { data } = await supabase.from("users").select("pubkey").eq("username", username).maybeSingle();
    if (data?.pubkey) latestPubKeyRef.current[username] = data.pubkey;
    return data?.pubkey || null;
  }, []);

  const decryptMessages = useCallback(async (data, otherUser, { forceRefreshKeys } = {}) => {
    if (!keyPair?.privateKey) {
      return data.map((msg) => ({ ...msg, decrypted: false }));
    }

    if (forceRefreshKeys) latestPubKeyRef.current = {};

    const otherUserPubKeyStr = await fetchPubKey(otherUser);

    const decrypted = await Promise.all(data.map(async (msg) => {
      if (msg.encrypted && msg.ciphertext && msg.iv) {
        if (msg.decrypted && msg.content) return msg; // 已解密的不重复处理
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            let peerPubKeyStr = await getPeerPubKeyStr(user, msg, otherUser);
            if (!peerPubKeyStr && otherUserPubKeyStr) peerPubKeyStr = otherUserPubKeyStr;
            if (!peerPubKeyStr) break;
            const peerPubKey = JSON.parse(peerPubKeyStr);
            const plain = await decryptMessage(msg.ciphertext, msg.iv, keyPair.privateKey, peerPubKey);
            return { ...msg, content: plain, decrypted: true };
          } catch (e) {
            if (attempt === 0) {
              // 第一次失败：强制刷新对方公钥后重试一次（密钥可能已轮换）
              const fallbackName = msg.sender === user.username ? msg.receiver : msg.sender;
              delete latestPubKeyRef.current[fallbackName];
              delete latestPubKeyRef.current[otherUser];
              continue;
            }
            console.warn("Decrypt failed for msg", msg.id, e);
            return { ...msg, content: null, decryptError: true, decrypted: false };
          }
        }
        return { ...msg, content: null, decryptError: true, decrypted: false };
      }
      return { ...msg, decrypted: false };
    }));
    return decrypted;
  }, [user, keyPair, fetchPubKey]);

  const loadDmMessages = useCallback(async (otherUser) => {
    if (!user || !otherUser) return;
    setDmHasMore(true);
    setDmMessages([]);

    const { data, error } = await supabase.from("dm_messages").select("*")
      .or(`and(sender.eq.${user.username},receiver.eq.${otherUser}),and(sender.eq.${otherUser},receiver.eq.${user.username})`)
      .order("created_at", { ascending: false })
      .limit(DM_PAGE_SIZE);
    if (error || !data) { setDmMessages([]); setDmHasMore(false); return; }

    setDmHasMore(data.length >= DM_PAGE_SIZE);

    const reversed = [...data].reverse();
    const decrypted = await decryptMessages(reversed, otherUser);
    setDmMessages(decrypted);

    try {
      await supabase.from("dm_messages").update({ read: true })
        .eq("sender", otherUser).eq("receiver", user.username).eq("read", false);
      checkUnread();
    } catch {}
  }, [user, decryptMessages, checkUnread]);

  const loadMoreDmMessages = useCallback(async () => {
    if (!user || !dmTarget || dmLoadingMore || !dmHasMore) return;
    setDmLoadingMore(true);

    const currentMessages = dmMessagesRef.current;
    const oldestMsg = currentMessages[0];
    const { data, error } = await supabase.from("dm_messages").select("*")
      .or(`and(sender.eq.${user.username},receiver.eq.${dmTarget}),and(sender.eq.${dmTarget},receiver.eq.${user.username})`)
      .order("created_at", { ascending: false })
      .limit(DM_PAGE_SIZE)
      .lt("created_at", oldestMsg?.created_at || new Date().toISOString());

    setDmLoadingMore(false);

    if (error || !data || data.length === 0) {
      setDmHasMore(false);
      return;
    }

    setDmHasMore(data.length >= DM_PAGE_SIZE);

    const reversed = [...data].reverse();
    const decrypted = await decryptMessages(reversed, dmTarget);
    setDmMessages((prev) => mergeMessages([...decrypted, ...prev], []));
  }, [user, dmTarget, dmLoadingMore, dmHasMore, decryptMessages]);

  // 增量拉取当前会话的新消息（Realtime / 轮询共用）
  const fetchNewMessages = useCallback(async (otherUser) => {
    if (!user || !otherUser) return [];
    const current = dmMessagesRef.current;
    const newest = current.length > 0 ? current[current.length - 1] : null;
    let query = supabase.from("dm_messages").select("*")
      .or(`and(sender.eq.${user.username},receiver.eq.${otherUser}),and(sender.eq.${otherUser},receiver.eq.${user.username})`)
      .order("created_at", { ascending: false })
      .limit(30);
    if (newest?.created_at) query = query.gt("created_at", newest.created_at);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return [];

    const reversed = [...data].reverse();
    return await decryptMessages(reversed, otherUser);
  }, [user, decryptMessages]);

  const sendDm = useCallback(async (content) => {
    if (!user || !dmTarget || !content.trim()) return false;
    setDmSending(true);

    const { data: recipient } = await supabase.from("users").select("pubkey").eq("username", dmTarget).maybeSingle();
    let msgData;
    let usedEncryption = false;

    const recipientRecord = parsePubkeyRecord(recipient?.pubkey);
    if (recipientRecord?.pub && keyPair?.privateKey) {
      try {
        const { ciphertext, iv } = await encryptMessage(content, keyPair.privateKey, recipientRecord.pub);
        msgData = {
          sender: user.username, receiver: dmTarget,
          content: "[加密消息]", ciphertext, iv, encrypted: true,
          sender_pubkey: JSON.stringify(keyPair.publicKey),
          receiver_pubkey: JSON.stringify(recipientRecord.pub),
        };
        usedEncryption = true;
      } catch (e) {
        console.warn("Encryption failed, sending plain:", e);
        msgData = { sender: user.username, receiver: dmTarget, content, encrypted: false };
      }
    } else {
      msgData = { sender: user.username, receiver: dmTarget, content, encrypted: false };
    }

    const { data, error } = await supabase.from("dm_messages").insert([msgData]).select("*").single();
    if (!error && data) {
      setDmMessages((prev) => {
        // 若轮询已抢先插入同一条消息，则跳过
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, { ...data, content, decrypted: true, encrypted: usedEncryption }];
      });
      loadDmList();
    }
    setDmSending(false);
    return !error;
  }, [user, dmTarget, keyPair, loadDmList]);

  const markAsRead = useCallback(async (otherUser) => {
    if (!user || !otherUser) return;
    try {
      await supabase.from("dm_messages").update({ read: true })
        .eq("sender", otherUser).eq("receiver", user.username).eq("read", false);
      checkUnread();
    } catch {}
  }, [user, checkUnread]);

  // ─── 实时消息：Realtime 订阅 + 轮询兜底 ───
  useEffect(() => {
    if (!user) { setDmLive(false); return; }

    const handleIncoming = async (msg) => {
      if (!msg) return;
      if (msg.sender !== user.username && msg.receiver !== user.username) return;

      // 更新会话列表
      loadDmList();

      const target = dmTargetRef.current;
      const inConversation =
        (msg.sender === target && msg.receiver === user.username) ||
        (msg.sender === user.username && msg.receiver === target);
      if (!inConversation) return;

      // 新消息进当前会话（去重）
      if (dmMessagesRef.current.find((m) => m.id === msg.id)) return;
      const [dec] = await decryptMessages([msg], target);
      setDmMessages((prev) => mergeMessages(prev, [dec]));

      // 收到对方消息时立即标记已读
      if (msg.sender === target && msg.receiver === user.username) {
        try {
          await supabase.from("dm_messages").update({ read: true }).eq("id", msg.id);
          setDmMessages((prev) => mergeMessages(prev, [{ ...dec, read: true }]));
          checkUnread();
        } catch {}
      }
    };

    let channel = null;
    try {
      channel = supabase
        .channel("dm_messages_live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" },
          (payload) => { handleIncoming(payload.new); })
        .subscribe((status) => {
          setDmLive(status === "SUBSCRIBED");
        });
    } catch {
      setDmLive(false);
    }

    // 轮询兜底（无论 Realtime 是否可用，始终低频运行，按 id 去重）
    const pollInterval = setInterval(async () => {
      const target = dmTargetRef.current;
      if (!target) return;
      const fresh = await fetchNewMessages(target);
      if (fresh.length === 0) return;
      const currentIds = new Set(dmMessagesRef.current.map((m) => m.id));
      const reallyNew = fresh.filter((m) => !currentIds.has(m.id));
      if (reallyNew.length > 0) {
        setDmMessages((prev) => mergeMessages(prev, reallyNew));
        if (reallyNew.some((m) => m.sender === target && !m.read)) {
          markAsRead(target);
        }
        loadDmList();
      }
    }, CHAT_POLL_MS);

    // 组件卸载 / 依赖变化时统一清理
    return () => {
      clearInterval(pollInterval);
      try { if (channel) supabase.removeChannel(channel); } catch {}
    };
  }, [user, loadDmList, decryptMessages, fetchNewMessages, markAsRead, checkUnread]);

  // Persist opened conversation locally (so it shows even without messages)
  const persistConversation = useCallback((otherUser) => {
    if (!user || !otherUser) return;
    const key = `stgblog_dm_opened_${user.username}`;
    try {
      const list = JSON.parse(localStorage.getItem(key)) || [];
      if (!list.includes(otherUser)) {
        list.push(otherUser);
        localStorage.setItem(key, JSON.stringify(list));
      }
    } catch {}
  }, [user]);

  const openDm = useCallback(async (otherUser) => {
    setDmTarget(otherUser);
    persistConversation(otherUser);
    // Also add to local list immediately
    setDmList((prev) => {
      if (prev.some((c) => c.other === otherUser)) return prev;
      const newList = [{ other: otherUser, last: null, pinned: false }, ...prev];
      saveCachedConversations(user.username, newList);
      return newList;
    });
    await loadDmMessages(otherUser);
  }, [loadDmMessages, persistConversation, user]);

  const closeDm = useCallback(() => {
    setDmTarget(null);
    setDmMessages([]);
    loadDmList();
    checkUnread();
  }, [loadDmList, checkUnread]);

  // Pin / Unpin conversation
  const togglePin = useCallback(async (otherUser) => {
    if (!user) return;
    const isPinned = dmListRef.current.find((c) => c.other === otherUser)?.pinned;
    if (isPinned) {
      await supabase.from("dm_pins").delete()
        .eq("username", user.username).eq("pinned_user", otherUser);
    } else {
      await supabase.from("dm_pins").insert([{ username: user.username, pinned_user: otherUser }]);
    }
    setDmList((prev) => {
      const updated = prev.map((c) => c.other === otherUser ? { ...c, pinned: !isPinned } : c)
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          const ta = a.last?.created_at || "1970-01-01";
          const tb = b.last?.created_at || "1970-01-01";
          return new Date(tb) - new Date(ta);
        });
      saveCachedConversations(user.username, updated);
      return updated;
    });
  }, [user]);

  // Delete conversation (hide from list)
  const deleteConversation = useCallback(async (otherUser) => {
    if (!user) return;
    const key = `stgblog_dm_opened_${user.username}`;
    try {
      const list = JSON.parse(localStorage.getItem(key)) || [];
      localStorage.setItem(key, JSON.stringify(list.filter((u) => u !== otherUser)));
    } catch {}
    await supabase.from("dm_pins").delete()
      .eq("username", user.username).eq("pinned_user", otherUser);
    setDmList((prev) => {
      const updated = prev.filter((c) => c.other !== otherUser);
      saveCachedConversations(user.username, updated);
      return updated;
    });
  }, [user]);

  return {
    dmList, dmTarget, dmMessages, dmSending, dmUnreadCount,
    dmHasMore, dmLoadingMore, dmLive,
    loadDmList, loadDmMessages, loadMoreDmMessages, sendDm, openDm, closeDm, markAsRead,
    setDmTarget, togglePin, deleteConversation,
  };
}
