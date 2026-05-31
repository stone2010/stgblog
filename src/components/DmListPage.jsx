import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";

export default function DmListPage({ dmList, onOpenDm, onNewDm }) {
  const { user } = useAuth();

  // Count unread per conversation (from dmList last messages)
  const listWithUnread = useMemo(() => {
    if (!user) return dmList;
    return dmList.map(({ other, last }) => ({
      other,
      last,
      isUnread: last.receiver === user.username && !last.read,
    }));
  }, [dmList, user]);

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
          <div className="dm-avatar">{other[0]}</div>
          <div className="dm-info">
            <div className="dm-name">{other}</div>
            <div className="dm-preview" style={isUnread ? { fontWeight: 600, color: "var(--text)" } : {}}>
              {last.encrypted ? "🔒 加密消息" : last.content}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className="dm-time">{formatTime(last.created_at)}</div>
            {last.sender === user.username && (
              <span className={`dm-read-status ${last.read ? "read" : ""}`} style={{ fontSize: 12 }}>
                {last.read ? "✓✓" : "✓"}
              </span>
            )}
            {isUnread && <div className="dm-unread-dot" />}
          </div>
        </div>
      ))}
    </div>
  );
}
