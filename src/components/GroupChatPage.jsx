import React, { useState, useCallback, useEffect, useRef } from "react";
import { Icons } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";

const CheckSingle = () => (
  <svg viewBox="0 0 16 11" width="14" height="10" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function GroupChatPage({ group, messages, members, sending, onSend, onBack, onUserClick, onKickMember, onDeleteGroup, onLeaveGroup, onGetMembers }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); } catch {}
  }, [messages]);

  const isCreator = group?.creator === user?.username;
  const isAdmin = members?.find((m) => m.username === user?.username)?.role === "admin";
  const myRole = members?.find((m) => m.username === user?.username)?.role;

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const ok = await onSend(group.id, input);
    if (ok) setInput("");
  }, [input, group, onSend]);

  const handleKick = useCallback((username) => {
    if (window.confirm(`确定将 ${username} 移出群组？`)) {
      onKickMember(group.id, username);
    }
  }, [group, onKickMember]);

  const handleDelete = useCallback(() => {
    if (window.confirm("确定删除此群组？所有消息将被删除。")) {
      onDeleteGroup(group.id);
    }
  }, [group, onDeleteGroup]);

  const handleLeave = useCallback(() => {
    if (window.confirm("确定退出群组？")) {
      onLeaveGroup(group.id);
    }
  }, [group, onLeaveGroup]);

  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <div className="dm-chat">
      <div className="dm-chat-top">
        <button className="dm-chat-back" onClick={onBack}><Icons.Back /></button>
        <div className="dm-avatar" style={{ width: 32, height: 32, fontSize: 13, background: "linear-gradient(135deg, #6366f1, #a855f7)", cursor: "pointer" }}
          onClick={() => { setShowInfo(!showInfo); if (!showInfo) onGetMembers(group.id); }}>
          {group.name[0]}
        </div>
        <span className="dm-chat-name" style={{ cursor: "pointer" }}
          onClick={() => { setShowInfo(!showInfo); if (!showInfo) onGetMembers(group.id); }}>
          {group.name}
        </span>
        <span className="dm-chat-lock"><Icons.Lock /> {members?.length || 0}人</span>
      </div>

      {showInfo && (
        <div className="group-info-panel">
          <div className="group-info-header">
            <div className="group-info-title">群组信息</div>
            <button className="auth-close" onClick={() => setShowInfo(false)}>✕</button>
          </div>
          <div className="group-info-invite">
            <span style={{ fontSize: 12, color: "var(--dim)" }}>邀请码</span>
            <div className="group-invite-code">
              <code>{group.invite_code}</code>
              <button className="group-copy-btn" onClick={() => { navigator.clipboard?.writeText(group.invite_code); }}>复制</button>
            </div>
          </div>
          <div className="group-info-members">
            <div className="group-info-subtitle">成员 ({members?.length || 0})</div>
            {(members || []).map((m) => (
              <div key={m.username} className="group-member-item">
                <div className="dm-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{m.username[0]}</div>
                <div className="dm-info">
                  <div className="dm-name" style={{ fontSize: 13 }}>
                    {m.username}
                    {m.role === "admin" && <span className="group-admin-badge">管理员</span>}
                    {m.username === group.creator && <span className="group-creator-badge">创建者</span>}
                  </div>
                </div>
                {isAdmin && m.username !== user.username && m.username !== group.creator && (
                  <button className="group-kick-btn" onClick={() => handleKick(m.username)}>移出</button>
                )}
              </div>
            ))}
          </div>
          <div className="group-info-actions">
            {!isCreator && (
              <button className="group-action-btn leave" onClick={handleLeave}>退出群组</button>
            )}
            {isCreator && (
              <button className="group-action-btn delete" onClick={handleDelete}>删除群组</button>
            )}
          </div>
        </div>
      )}

      <div className="dm-chat-messages">
        {safeMessages.length === 0 && (
          <div className="dm-empty">
            <div className="dm-empty-icon">👥</div>
            <h3>{group.name}</h3>
            <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>群组消息已加密保护</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(0,186,124,0.1)", borderRadius: 99, fontSize: 12, color: "var(--green)" }}>
              <Icons.Lock /> 端到端加密
            </div>
          </div>
        )}
        {safeMessages.map((msg, i) => {
          if (!msg) return null;
          const isMine = msg.sender === user?.username;
          return (
            <div key={msg.id || i} className={`dm-msg ${isMine ? "sent" : "received"}`}>
              {!isMine && (
                <div className="group-msg-sender" onClick={() => onUserClick?.(msg.sender)}>
                  {msg.sender}
                </div>
              )}
              {msg.content || ''}
              <div className="dm-msg-meta">
                <span className="dm-msg-time">{formatTime(msg.created_at)}</span>
                {(msg.decrypted || msg.encrypted) && <span className="dm-msg-lock">🔒</span>}
                {isMine && <span className="dm-tick sent"><CheckSingle /></span>}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="dm-chat-input">
        <textarea className="dm-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="发送群消息..." rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
        <button className="dm-send-btn" onClick={handleSend} disabled={sending || !input.trim()}>
          {sending ? "..." : "↑"}
        </button>
      </div>
    </div>
  );
}
