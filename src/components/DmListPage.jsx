import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatTimeShort } from "../utils";

// Telegram-style checkmark SVGs
const CheckSingle = () => (
  <svg viewBox="0 0 16 11" width="14" height="10" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckDouble = () => (
  <svg viewBox="0 0 21 11" width="18" height="10" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 5.5L10.5 10L19.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function DmListPage({ dmList, onOpenDm, onNewDm }) {
  const { user } = useAuth();
  const [error, setError] = useState(null);

  const listWithUnread = useMemo(() => {
    try {
      if (!user || !Array.isArray(dmList)) return dmList || [];
      return dmList.map((item) => {
        if (!item || !item.last) return { other: item?.other || '?', last: item?.last || {}, isUnread: false };
        return {
          other: item.other,
          last: item.last,
          isUnread: item.last.receiver === user.username && !item.last.read,
        };
      });
    } catch (e) {
      console.error("DmListPage error:", e);
      setError(e.message);
      return [];
    }
  }, [dmList, user]);

  if (error) {
    return (
      <div className="dm-list">
        <div className="dm-header"><h3>私信</h3></div>
        <div className="empty-state"><div className="icon">⚠️</div><h3>加载出错</h3><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="dm-list">
      <div className="dm-header">
        <h3>私信</h3>
        <button className="dm-new-btn" onClick={onNewDm}>✏️</button>
      </div>
      {!user ? (
        <div className="empty-state"><div className="icon">🔒</div><h3>登录后查看私信</h3><p>端到端加密保护你的隐私</p></div>
      ) : listWithUnread.length === 0 ? (
        <div className="empty-state"><div className="icon">💬</div><h3>暂无私信</h3><p>开始和朋友聊天吧</p></div>
      ) : listWithUnread.map(({ other, last, isUnread }) => (
        <div key={other} className={`dm-item ${isUnread ? "dm-unread-item" : ""}`} onClick={() => onOpenDm(other)}>
          <div className="dm-avatar">{other?.[0] || '?'}</div>
          <div className="dm-info">
            <div className="dm-name">{other}</div>
            <div className="dm-preview" style={isUnread ? { fontWeight: 600, color: "var(--text)" } : {}}>
              {last?.encrypted ? "🔒 加密消息" : (last?.content || "暂无消息")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className="dm-time">{formatTimeShort(last?.created_at)}</div>
            {last?.sender === user.username && (
              <span className={`dm-tick ${last?.read ? "read" : "sent"}`}>
                {last?.read ? <CheckDouble /> : <CheckSingle />}
              </span>
            )}
            {isUnread && <div className="dm-unread-dot" />}
          </div>
        </div>
      ))}
    </div>
  );
}
