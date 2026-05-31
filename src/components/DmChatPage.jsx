import React, { useState, useCallback, useEffect, useRef } from "react";
import { Icons } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";

export default function DmChatPage({ dmTarget, dmMessages, dmSending, onSend, onBack, onUserClick, onMarkAsRead }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  // Mark as read when opening chat
  useEffect(() => {
    if (dmTarget) onMarkAsRead?.(dmTarget);
  }, [dmTarget, onMarkAsRead]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const ok = await onSend(input);
    if (ok) setInput("");
  }, [input, onSend]);

  // Get the last message sent by user to show read receipt
  const lastSentMsg = [...dmMessages].reverse().find((m) => m.sender === user?.username);

  return (
    <div className="dm-chat">
      <div className="dm-chat-top">
        <button className="dm-chat-back" onClick={onBack}><Icons.Back /></button>
        <div className="dm-avatar" style={{ width: 32, height: 32, fontSize: 13, cursor: "pointer" }} onClick={() => onUserClick(dmTarget)}>{dmTarget?.[0]}</div>
        <span className="dm-chat-name" style={{ cursor: "pointer" }} onClick={() => onUserClick(dmTarget)}>{dmTarget}</span>
        <span className="dm-chat-lock"><Icons.Lock /> 端到端加密</span>
      </div>
      <div className="dm-chat-messages">
        {dmMessages.length === 0 && (
          <div className="dm-empty">
            <div className="dm-empty-icon">🔐</div>
            <h3>加密对话</h3>
            <p style={{ fontSize: 13, color: "var(--dim)" }}>消息使用端到端加密，只有你和 {dmTarget} 能看到</p>
          </div>
        )}
        {dmMessages.map((msg, i) => {
          const isMine = msg.sender === user?.username;
          const isLast = i === dmMessages.length - 1;
          return (
            <div key={msg.id || i} className={`dm-msg ${isMine ? "sent" : "received"}`}>
              {msg.content}
              <div className="dm-msg-time">
                {formatTime(msg.created_at)}
                {msg.encrypted && " 🔒"}
                {isMine && (
                  <span className={`dm-read-status ${msg.read ? "read" : ""}`}>
                    {msg.read ? " ✓✓" : " ✓"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="dm-chat-input">
        <textarea className="dm-input" value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="发送加密消息..." rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
        <button className="dm-send-btn" onClick={handleSend} disabled={dmSending || !input.trim()}>
          {dmSending ? "..." : "↑"}
        </button>
      </div>
    </div>
  );
}
