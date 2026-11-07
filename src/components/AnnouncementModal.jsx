import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { formatTimeShort } from "../utils";

const SEEN_KEY = (uid) => `stgblog_seen_announcements_${uid || "guest"}`;

function loadSeen(uid) {
  try {
    const arr = JSON.parse(localStorage.getItem(SEEN_KEY(uid))) || [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveSeen(uid, seen) {
  try { localStorage.setItem(SEEN_KEY(uid), JSON.stringify(seen.slice(-50))); } catch {}
}

// U-1：公告改为"非阻断顶部横幅"。旧实现是全屏 .ann-overlay（z-index 1000），
// 不点"知道了"就无法发帖/切页/进设置，多条未读还会连续排队锁死操作。
// 现在容器 pointer-events:none，只有卡片本身可交互，页面其余部分完全可用。
export default function AnnouncementModal({ user }) {
  const [queue, setQueue] = useState([]);   // 未读公告（最新的先弹）
  const [current, setCurrent] = useState(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!user) return; // 未登录不显示公告

    let active = true;
    (async () => {
      // 延迟让首屏内容和 Onboarding 先渲染，不抢焦点
      await new Promise((r) => setTimeout(r, 900));
      const { data, error } = await supabase.from("posts")
        .select("id, title, content, author, created_at")
        .eq("is_announcement", true)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error || !active || !Array.isArray(data)) return; // 列不存在（未跑迁移）→ 静默
      const seen = loadSeen(user.username);
      const unseen = data.filter((p) => !seen.includes(p.id));
      if (unseen.length > 0) {
        setQueue(unseen);
        setCurrent(unseen[0]);
        setFading(true);
        requestAnimationFrame(() => setFading(false));
      }
    })();
    return () => { active = false; };
  }, [user?.username]); // 登录/登出、账号切换时重新判断

  const dismiss = useCallback(() => {
    if (!current) return;
    const uid = user?.username;
    const seen = loadSeen(uid);
    if (!seen.includes(current.id)) {
      seen.push(current.id);
      saveSeen(uid, seen);
    }
    setFading(true);
    setTimeout(() => {
      const next = queue.find((p) => p.id !== current.id && !loadSeen(uid).includes(p.id));
      setQueue((q) => next ? q.filter((p) => p.id !== current.id) : []);
      setCurrent(next || null);
      if (next) requestAnimationFrame(() => setFading(false));
    }, 180);
  }, [current, queue, user?.username]);

  const markAllRead = useCallback(() => {
    const uid = user?.username;
    saveSeen(uid, [...new Set([...loadSeen(uid), ...queue.map((p) => p.id)])]);
    setQueue([]);
    setCurrent(null);
  }, [queue, user?.username]);

  if (!current) return null;

  return (
    <div className={`ann-banner-layer ${fading ? "fade" : ""}`}>
      <div className="ann-banner" role="status" aria-live="polite">
        <div className="ann-head">
          <span className="ann-icon">📢</span>
          <span className="ann-title">公告</span>
          <button className="ann-close" onClick={dismiss} aria-label="关闭">✕</button>
        </div>
        <div className="ann-meta">
          <span className="ann-author">{current.author}</span>
          <span className="ann-dot">·</span>
          <span className="ann-time">{formatTimeShort(current.created_at)}</span>
        </div>
        <div className="ann-content">{current.content}</div>
        <div className="ann-actions">
          {queue.length > 1 && (
            <button className="ann-all" onClick={markAllRead}>全部已读（{queue.length}）</button>
          )}
          <button className="ann-ok" onClick={dismiss}>知道了</button>
        </div>
      </div>
    </div>
  );
}
