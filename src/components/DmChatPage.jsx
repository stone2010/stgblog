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
    <path d="M6 5.5L10.5 10L19.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function DmChatPage({ dmTarget, dmMessages, dmSending, onSend, onBack, onUserClick, onMarkAsRead, onLoadMore, onRecall, dmLive }) {
  const { user, keyPair } = useAuth();
  const [input, setInput] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [remotePubJwk, setRemotePubJwk] = useState(null);
  const [remoteFP, setRemoteFP] = useState(null);
  const [localFP, setLocalFP] = useState(null);
  const [copied, setCopied] = useState(false);
  const [warning, setWarning] = useState(null);
  const [revokeConfirm, setRevokeConfirm] = useState(null); // 存待撤回的消息 id
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const lastLoadMoreRef = useRef(0);
  const nearBottomRef = useRef(true);
  const messagesEndRef = useRef(null);

  // ─── 公钥指纹 ───
  useEffect(() => {
    (async () => {
      setLocalFP(await pubkeyFingerprint(keyPair?.publicKey));
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
        if (inputRef.current) inputRef.current.style.height = "auto";
        nearBottomRef.current = true;
        const container = messagesContainerRef.current;
        if (container) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
          }));
        }
      } else {
        setWarning("发送失败，请检查网络后重试");
      }
    } catch (e) {
      console.error("Send failed:", e);
      setWarning("发送失败，请检查网络后重试");
    }
  }, [input, onSend, dmSending, dmTarget, hasRemoteKey]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

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

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 2500);
    return () => clearTimeout(t);
  }, [warning]);

  // ─── 自动滚动：打开会话 / 新消息到达时定位到最新消息 ───
  // 规则：
  //   · 刚打开会话（首屏消息载入）→ 总是滚到最底部
  //   · 顶部加载了更早的历史（最后一仍是旧消息）→ 保持当前阅读位置
  //   · 新消息追加 → 仅当本来就贴近底部、或消息是自己发的时才跟随滚动
  const lastSeenMsgRef = useRef(null);
  useEffect(() => {
    nearBottomRef.current = true;
    lastSeenMsgRef.current = null;
    const el = inputRef.current;
    if (el) el.style.height = "auto";
    setInput("");
  }, [dmTarget]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const last = messages.length ? messages[messages.length - 1] : null;
    const lastId = last ? last.id : null;
    if (lastId == null) return;                       // 空会话：无需滚动
    const prevId = lastSeenMsgRef.current;
    if (prevId === lastId) return;                    // 顶部加载历史：保持位置
    const isFirstLoad = prevId == null;
    lastSeenMsgRef.current = lastId;
    const mine = last && last.sender === user?.username;
    if (!isFirstLoad && !mine && !nearBottomRef.current) return; // 正在回看历史：不打扰
    container.style.scrollBehavior = "auto";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      nearBottomRef.current = true;
    }));
  }, [messages, user]);

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
        在另一台设备上打开与 {dmTarget} 的对话，对比两段指纹是否一致。
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
      {fingerprintsMatch && <div className="dm-verify-ok"><Icons.Lock /> 双方指纹一致，连接安全</div>}
    </div>
  );

  // ─── 撤回：由 useDM.recallDm 统一处理（服务端 + 本地 + 对方端实时同步）───
  const handleRevoke = async (msgId) => {
    if (!user || !onRecall || !msgId) return;
    try {
      const ok = await onRecall(msgId);
      if (ok) {
        setRevokeConfirm(null);
      } else {
        setWarning("撤回失败，请稍后重试");
      }
    } catch (e) {
      console.error("Revoke failed:", e);
      setWarning("撤回失败，请检查网络后重试");
    }
  };

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
        {messages.map((msg) => {
          if (!msg) return null;
          const isMine = msg.sender === user?.username;
          const isEncrypted = !!msg.encrypted || msg.content === "[加密消息]";
          const isRevoked = msg.revoked || msg.content === "[消息已撤回]";
          const decryptionFailed = !msg.content && !isMine && (msg.encrypted || isEncrypted);
          let body = null;
          if (isRevoked) body = "消息已撤回";
          else if (msg.content) body = msg.content;
          else if (decryptionFailed) body = "🔒 无法解密此消息";
          else if (isEncrypted) body = "🔒 加密消息";
          else body = "";

          return (
            <div key={msg.id || `i${Math.random()}`} className={`dm-msg ${isMine ? "sent" : "received"} ${msg.decryptError ? "decrypt-fail" : ""} ${isRevoked ? "revoked" : ""}`}>
              <div className="dm-msg-bubble">{body}</div>
              <div className="dm-msg-meta">
                <span className="dm-msg-time">{formatTime(msg.created_at)}</span>
                {!isRevoked && (isEncrypted || msg.decrypted) && <span className="dm-msg-lock">🔒</span>}
                {isMine && !isRevoked && (
                  <span className={`dm-tick ${msg.read ? "read" : "sent"}`}>
                    {msg.read ? <CheckDouble /> : <CheckSingle />}
                  </span>
                )}
                {isMine && !isRevoked && onRecall && (
                  <button className="dm-msg-recall-btn" title="撤回这条消息" onClick={() => setRevokeConfirm(msg.id)}>
                    撤回
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {warning && <div className="dm-chat-warning">⚠️ {warning}</div>}
      {revokeConfirm != null && (
        <div className="dm-confirm-overlay" onClick={() => setRevokeConfirm(null)}>
          <div className="dm-confirm-box">
            <h3>撤回消息</h3>
            <p>确定要撤回这条消息吗？撤回后双方都将无法查看。</p>
            <div className="dm-confirm-actions">
              <button className="dm-confirm-cancel" onClick={() => setRevokeConfirm(null)}>取消</button>
              <button className="dm-confirm-ok" onClick={() => handleRevoke(revokeConfirm)}>确认撤回</button>
            </div>
          </div>
        </div>
      )}
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
