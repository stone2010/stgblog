import React from "react";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";

export default function DmListPage({ dmList, onOpenDm, onNewDm }) {
  const { user } = useAuth();

  return (
    <div className="dm-list">
      <div className="dm-header">
        <h3>私信</h3>
        <button className="dm-new-btn" onClick={onNewDm}>✏️</button>
      </div>
      {!user ? (
        <div className="empty-state"><div className="icon">🔒</div><h3>登录后查看私信</h3><p>端到端加密保护你的隐私</p></div>
      ) : dmList.length === 0 ? (
        <div className="empty-state"><div className="icon">💬</div><h3>暂无私信</h3><p>开始和朋友聊天吧</p></div>
      ) : dmList.map(({ other, last }) => (
        <div key={other} className="dm-item" onClick={() => onOpenDm(other)}>
          <div className="dm-avatar">{other[0]}</div>
          <div className="dm-info">
            <div className="dm-name">{other}</div>
            <div className="dm-preview">{last.encrypted ? "🔒 加密消息" : last.content}</div>
          </div>
          <div className="dm-time">{formatTime(last.created_at)}</div>
        </div>
      ))}
    </div>
  );
}
