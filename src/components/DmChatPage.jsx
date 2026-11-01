import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Icons } from "./Icons";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../utils";
import { supabase } from "../supabase";
import { pubkeyFingerprint } from "../crypto";

const CheckSingle = () => (
  <svg viewBox="0 0 16 11" width="16" height="11" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckDouble = () => (
  <svg viewBox="0 0 21 11" width="21" height="11" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 5.5L10.5 10L19.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

export default function DmChatPage({ dmTarget, dmMessages, dmSending, onSend, onBack, onUserClick, onMarkAsRead, onLoadMore, dmLive }) {
  const { user, keyPair } = useAuth();
  const [input, setInput] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [remotePubJwk, setRemotePubJwk] = useState(null);
  const [remoteFP, setRemoteFP] = useState(null);
  const [localFP, setLocalFP] = useState(null);
  const [copied, setCopied] = useState(false);
  const [warning, setWarning] = useState(null); // 发送相关警示
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastLoadMoreRef = useRef(0);
  const nearBottomRef = useRef(true);

  // ─── 公钥指纹 ───
  useEffect(() => {
    (async () => {
      setRemoteFP(await pubkeyFingerprint(keyPair?.publicKey));
    })();
  }, [keyPair]);

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1200);
      return () => clearTimeout(t);
    }
  }, [copied]);

  useEffect(() => {
    if (!dmTarget) { setRemotePubJwk(null); setRemoteFP(null); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from("users").select("pubkey").eq("username", dmTarget).maybeSingle();
      if (!active) return;
      try {
        const raw = data?.pubkey ? JSON.parse(data.pubkey) : null;
        const jwk = raw?.pub?.kty ? raw.pub : (raw?.kty ? raw : null);
        setRemotePubJwk(jwk);
        setRemoteFP(await pubkeyFingerprint(jwk));
      } catch { setRemotePubJwk(null); setRemoteFP(null); }
    })();
    return () => { active = false; };
  }, [dmTarget]);

  const hasRemoteKey = !!remotePubJwk;

  // ─── 发送：无对方公钥时提示明文，带加密状态提示条 ───
  const handleSend = useCallback(async () => {
    const text = input;
    if (!text.trim() || dmSending) return;
    if (!hasRemoteKey) {
      const okSend = window.confirm(`⚠️ ${dmTarget} 还没有上传加密公钥（可能注册后一直没登录）。\n\n以明文发送此消息？`);
      if (!okSend) return;
    }
    try {
      const ok = await onSend(text);
      if (ok) {
        setInput("");
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
        }
        nearBottomRef.current = true;
        setTimeout(() => {
          const container = messagesContainerRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        }, 60);
      } else {
        setWarning("发送失败，请检查网络后重试");
      }
    } catch (e) {
      console.error("Send failed:", e);
      setWarning("发送失败，请检查网络后重试");
    }
  }, [input, onSend, dmSending, dmTarget, hasRemoteKey]);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 2500);
    return () => clearTimeout(t);
  }, [warning]);

  // ─── 智能自动滚动：仅当用户贴近底部时跟随新消息 ───
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (nearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [dmMessages]);

  useEffect(() => {
    // 切换会话后立即滚动到底部
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [dmTarget]);

  // ─── 输入框自动增高 ───
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // ─── 滚动：向上加载更多（节流 + 触发距离）───
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    nearBottomRef.current = distanceToBottom < 120;
    if (container.scrollTop <= 8 && onLoadMore) {
      const now = Date.now();
      if (now - lastLoadMoreRef.current > 1200) {
        lastLoadMoreRef.current = now;
        onLoadMore();
      }
    }
  }, [onLoadMore]);

  // 进入会话后标记已读
  useEffect(() => {
    try { if (dmTarget && onMarkAsRead) onMarkAsRead(dmTarget); } catch {}
  }, [dmTarget, onMarkAsRead]);

  const messages = useMemo(() => (Array.isArray(dmMessages) ? dmMessages : []), [dmMessages]);

  const copyBoth = useCallback(() => {
    const text = `我的指纹: ${localFP}\n${dmTarget}的指纹: ${remoteFP}`;
    try { navigator.clipboard.writeText(text); } catch {}
    setCopied(true);
  }, [localFP, remoteFP, dmTarget]);

  const fingerprintsMatch = localFP && remoteFP && localFP === remoteFP;

  const renderVerify = () => (
    <div className="dm-verify-panel">
      <div className="dm-verify-head">
        <span className="dm-verify-title">🔐 加密验证</span>
        <button className="dm-verify-copy" onClick={copyBoth}>{copied ? "已复制 ✓" : "对比指纹"}</button>
      </div>
      <div className="dm-verify-tip">
        在另一台设备上打开与 {dmTarget} 的对话，对比两段指纹是否一致。一致＝你们之间的加密链路未被替换。
      </div>
      <div className="dm-verify-grid">
        <div className="dm-verify-item">
          <div className="dm-verify-label">你的指纹</div>
          <div className="dm-verify-fp">{localFP || "..."}</div>
        </div>
        <div className={`dm-verify-item ${fingerprintsMatch ? "match" : ""}`}>
          <div className="dm-verify-label">{dmTarget} 的指纹</div>
          <div className="dm-verify-fp">{remoteFP || "（对方未上传公钥）"}</div>
        </div>
      </div>
      {fingerprintsMatch && (
        <div className="dm-verify-ok"><Icons.Lock /> 双方指纹一致，连接安全</div>
      )}
    </div>
  );

  return (
    <div className="dm-chat">
      <div className="dm-chat-top">
        <button className="dm-chat-back" onClick={onBack} aria-label="返回"><Icons.Back /></button>
        <div className="dm-avatar dm-avatar-clickable" onClick={() => onUserClick?.(dmTarget)}>
          {dmTarget?.[0] || '?'}
        </div>
        <div className="dm-chat-title" onClick={() => onUserClick?.(dmTarget)}>
          <span className="dm-chat-name">{dmTarget || '未知'}</span>
          <span className={`dm-chat-status ${hasRemoteKey && dmLive ? "on" : ""}`}>
            {hasRemoteKey ? (dmLive ? "实时同步中" : "端到端加密") : "加密不可用"}
          </span>
        </div>
        <button className={`dm-chat-lock ${showVerify ? "active" : ""}`} onClick={() => setShowVerify(!showVerify)}>
          <Icons.Lock /> 验证
        </button>
      </div>
      {showVerify && renderVerify()}
      <div className="dm-chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="dm-empty">
            <div className="dm-empty-icon">🔐</div>
            <h3>端到端加密对话</h3>
            <p>消息使用 ECDH + AES-256-GCM 加密，只有你和 {dmTarget} 能看到</p>
            <div className={`dm-empty-badge ${hasRemoteKey ? "ok" : "warn"}`}>
              <Icons.Lock /> {hasRemoteKey ? "加密已启用" : "对方公钥缺失 · 消息将明文发送"}
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <div className="dm-chat-begin">
            <Icons.Lock />
            <span>端到端加密 · 仅你与 {dmTarget} 可见</span>
          </div>
        )}
        {messages.map((msg, i) => {
          if (!msg) return null;
          const isMine = msg.sender === user?.username;
          const isEncrypted = !!msg.encrypted || msg.content === "[加密消息]";
          const decryptionFailed = !msg.content && !isMine && (msg.encrypted || isEncrypted);
          let body = null;
          if (msg.content) body = msg.content;
          else if (decryptionFailed) body = "🔒 无法解密此消息";
          else if (isEncrypted) body = "🔒 加密消息";
          else body = "";

          const isFail = decryptionFailed && !msg.content;
          return (
            <div key={msg.id || `i${i}`} className={`dm-msg ${isMine ? "sent" : "received"} ${msg.decryptError ? "decrypt-fail" : ""}`}>
              <div className="dm-msg-bubble">{body}</div>
              <div className="dm-msg-meta">
                <span className="dm-msg-time">{formatTime(msg.created_at)}</span>
                {(isEncrypted || msg.decrypted) && <span className="dm-msg-lock">🔒</span>}
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
      {warning && <div className="dm-chat-warning">⚠️ {warning}</div>}
      <div className="dm-chat-input">
        <textarea ref={inputRef} className="dm-input" value={input} onChange={handleInputChange}
          placeholder={hasRemoteKey ? "输入加密消息…" : "对方未设置公钥（消息将以明文发送）"}
          rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
        <button className="dm-send-btn" onClick={handleSend} disabled={dmSending || !input.trim()} aria-label="发送">
          {dmSending ? <span className="dm-send-dot" /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
