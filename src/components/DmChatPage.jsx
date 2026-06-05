import React, { useState, useCallback, useEffect, useRef } from "react";
import { Icons } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";
import { supabase } from "../supabase";

// Telegram-style checkmark SVGs
const CheckSingle = () => (
  <svg viewBox="0 0 16 11" width="16" height="11" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckDouble = () => (
  <svg viewBox="0 0 21 11" width="21" height="11" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 5.5L10.5 10L19.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function DmChatPage({ dmTarget, dmMessages, dmSending, onSend, onBack, onUserClick, onMarkAsRead }) {
  const { user, keyPair } = useAuth();
  const [input, setInput] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [remotePubKey, setRemotePubKey] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); } catch {}
  }, [dmMessages]);

  // Mark as read when opening chat
  useEffect(() => {
    try { if (dmTarget && onMarkAsRead) onMarkAsRead(dmTarget); } catch {}
  }, [dmTarget, onMarkAsRead]);

  // Fetch remote public key for verification
  useEffect(() => {
    if (!dmTarget) { setRemotePubKey(null); return; }
    (async () => {
      const { data } = await supabase.from("users").select("pubkey").eq("username", dmTarget).maybeSingle();
      if (data?.pubkey) {
        try { setRemotePubKey(JSON.parse(data.pubkey)); } catch { setRemotePubKey(null); }
      }
    })();
  }, [dmTarget]);

  const localPubKeyFingerprint = keyPair?.publicKey?.x ? keyPair.publicKey.x.slice(0, 16) : null;
  const remotePubKeyFingerprint = remotePubKey?.x ? remotePubKey.x.slice(0, 16) : null;

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    try {
      const ok = await onSend(input);
      if (ok) setInput("");
    } catch (e) {
      console.error("Send failed:", e);
    }
  }, [input, onSend]);

  const messages = Array.isArray(dmMessages) ? dmMessages : [];

  return (
    <div className="dm-chat">
      <div className="dm-chat-top">
        <button className="dm-chat-back" onClick={onBack}><Icons.Back /></button>
        <div className="dm-avatar" style={{ width: 32, height: 32, fontSize: 13, cursor: "pointer" }} onClick={() => onUserClick?.(dmTarget)}>{dmTarget?.[0] || '?'}</div>
        <span className="dm-chat-name" style={{ cursor: "pointer" }} onClick={() => onUserClick?.(dmTarget)}>{dmTarget || '未知'}</span>
        <span className="dm-chat-lock" style={{ cursor: "pointer" }} onClick={() => setShowVerify(!showVerify)}><Icons.Lock /> 端到端加密</span>
      </div>
      {showVerify && (
        <div style={{ padding: "12px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔐 加密验证</div>
          <p style={{ color: "var(--dim)", marginBottom: 8, lineHeight: 1.5 }}>对比以下指纹，确认你和 {dmTarget} 的加密连接安全：</p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: "var(--dim)", marginBottom: 4 }}>你的密钥</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--accent)", wordBreak: "break-all" }}>{localPubKeyFingerprint || "..."}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ color: "var(--dim)", marginBottom: 4 }}>{dmTarget} 的密钥</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--green)", wordBreak: "break-all" }}>{remotePubKeyFingerprint || "..."}</div>
            </div>
          </div>
        </div>
      )}
      <div className="dm-chat-messages">
        {messages.length === 0 && (
          <div className="dm-empty">
            <div className="dm-empty-icon">🔐</div>
            <h3>端到端加密对话</h3>
            <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 8 }}>消息使用 ECDH + AES-256-GCM 加密，只有你和 {dmTarget} 能看到</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(0,186,124,0.1)", borderRadius: 99, fontSize: 12, color: "var(--green)" }}>
              <Icons.Lock /> 加密已启用
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          if (!msg) return null;
          const isMine = msg.sender === user?.username;
          const showLock = msg.decrypted || (msg.encrypted && msg.content === "[加密消息]");
          return (
            <div key={msg.id || i} className={`dm-msg ${isMine ? "sent" : "received"}`}>
              {msg.content || ''}
              <div className="dm-msg-meta">
                <span className="dm-msg-time">{formatTime(msg.created_at)}</span>
                {showLock && <span className="dm-msg-lock">🔒</span>}
                {isMine && (
                  <span className={`dm-tick ${msg.read ? "read" : "sent"}`}>
                    {msg.read ? <CheckDouble /> : <CheckSingle />}
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
