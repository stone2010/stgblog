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

export default function DmChatPage({ dmTarget, dmMessages, dmSending, onSend, onBack, onUserClick, onMarkAsRead, onLoadMore, dmLive }) {
  const { user, keyPair } = useAuth();
  const [input, setInput] = useState("");
  const [showVerify, setShowVerify] = useState(false);
  const [remotePubJwk, setRemotePubJwk] = useState(null);
  const [remoteFP, setRemoteFP] = useState(null);
  const [localFP, setLocalFP] = useState(null);
  const [copied, setCopied] = useState(false);
  const [warning, setWarning] = useState(null);
  const [encryptionStatus, setEncryptionStatus] = useState("checking");
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [deleteRequestConfirm, setDeleteRequestConfirm] = useState(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastLoadMoreRef = useRef(0);
  const nearBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

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
    if (!dmTarget) { setRemotePubJwk(null); setRemoteFP(null); setEncryptionStatus("no-key"); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from("users").select("pubkey").eq("username", dmTarget).maybeSingle();
      if (!active) return;
      try {
        const raw = data?.pubkey ? JSON.parse(data.pubkey) : null;
        const jwk = raw?.pub?.kty ? raw.pub : (raw?.kty ? raw : null);
        setRemotePubJwk(jwk);
        setRemoteFP(await pubkeyFingerprint(jwk));
        setEncryptionStatus(jwk ? "encrypted" : "plain");
      } catch { setRemotePubJwk(null); setRemoteFP(null); setEncryptionStatus("no-key"); }
    })();
    return () => { active = false; };
  }, [dmTarget]);

  const hasRemoteKey = !!remotePubJwk;

  const getEncryptionStatusText = () => {
    if (!dmTarget) return null;
    if (!remotePubJwk) return (
      <span className="dm-chat-status no-key">
        <Icons.Lock /> ⚠️ 对方未设置公钥 · 消息将明文发送
      </span>
    );
    return (
      <span className={`dm-chat-status ${dmLive ? "on" : "off"}`}>
        <Icons.Lock /> {dmLive ? "实时同步中" : "端到端加密"} · 指纹 {remoteFP?.slice(-6) || "..."}
      </span>
    );
  };

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

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (nearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [dmMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [dmTarget]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && !initialScrollDoneRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDoneRef.current = true;
    }
  }, [dmTarget]);

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

  const handleRevoke = async (msgId) => {
    if (!user) return;
    setRevokeConfirm(null);
    try {
      await supabase.from("dm_messages").update({ content: "[消息已撤回]", encrypted: false, ciphertext: null, iv: null, revoked: true })
        .eq("id", msgId);
    } catch (e) {
      console.error("Revoke failed:", e);
      setWarning("撤回失败，请检查网络后重试");
    }
  };

  const handleDeleteRequest = async (msgId) => {
    if (!user) return;
    setDeleteRequestConfirm(null);
    try {
      await supabase.from("dm_messages").insert([{
        sender: user.username,
        receiver: dmTarget,
        content: "[删除请求]",
        ciphertext: null,
        iv: null,
        encrypted: false,
        delete_request: true,
        delete_request_target: msgId,
      }]);
      setWarning("删除请求已发送，等待对方确认");
    } catch (e) {
      console.error("Delete request failed:", e);
      setWarning("发送删除请求失败");
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
            {getEncryptionStatusText()}
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
          const isRevoked = msg.revoked || msg.content === "[消息已撤回]";
          const isDeleteRequest = msg.delete_request;
          const decryptionFailed = !msg.content && !isMine && (msg.encrypted || isEncrypted);
          let body = null;
          if (isRevoked) body = "💬 消息已撤回";
          else if (isDeleteRequest) body = "🗑️ 对方请求删除此消息";
          else if (msg.content) body = msg.content;
          else if (decryptionFailed) body = "🔒 无法解密此消息";
          else if (isEncrypted) body = "🔒 加密消息";
          else body = "";

          const isFail = decryptionFailed && !msg.content;
          return (
            <div key={msg.id || `i${i}`} className={`dm-msg ${isMine ? "sent" : "received"} ${msg.decryptError ? "decrypt-fail" : ""} ${isRevoked ? "revoked" : ""} ${isDeleteRequest ? "delete-request" : ""}`}>
              <div className="dm-msg-bubble">{body}</div>
              <div className="dm-msg-meta">
                <span className="dm-msg-time">{formatTime(msg.created_at)}</span>
                {(isEncrypted || msg.decrypted) && <span className="dm-msg-lock">🔒</span>}
                {isMine && (
                  <>
                    <span className={`dm-tick ${msg.read ? "read" : "sent"}`}>
                      {msg.read ? <CheckDouble /> : <CheckSingle />}
                    </span>
                    {!isRevoked && !isDeleteRequest && (
                      <span className="dm-msg-actions" onClick={(e) => { e.stopPropagation(); }}>
                        <button className="dm-msg-action-btn" title="撤回" onClick={() => setRevokeConfirm(msg.id)}>
                          ❌
                        </button>
                        <button className="dm-msg-action-btn" title="请求删除" onClick={() => setDeleteRequestConfirm(msg.id)}>
                          🗑️
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {warning && <div className="dm-chat-warning">⚠️ {warning}</div>}
      {revokeConfirm && (
        <div className="dm-confirm-overlay" onClick={() => setRevokeConfirm(null)}>
          <div className="dm-confirm-box">
            <h3>撤回消息</h3>
            <p>确定要撤回这条消息吗？撤回后双方都将无法查看。</p>
            <div className="dm-confirm-actions">
              <button className="dm-confirm-cancel" onClick={() => setRevokeConfirm(null)}>取消</button>
              <button className="dm-confirm-ok" onClick={() => handleRevoke(revokeConfirm.id)}>确认撤回</button>
            </div>
          </div>
        </div>
      )}
      {deleteRequestConfirm && (
        <div className="dm-confirm-overlay" onClick={() => setDeleteRequestConfirm(null)}>
          <div className="dm-confirm-box">
            <h3>删除请求</h3>
            <p>确定要向对方发送删除请求吗？对方同意后此消息将被删除。</p>
            <div className="dm-confirm-actions">
              <button className="dm-confirm-cancel" onClick={() => setDeleteRequestConfirm(null)}>取消</button>
              <button className="dm-confirm-ok" onClick={() => handleDeleteRequest(deleteRequestConfirm.id)}>发送请求</button>
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
