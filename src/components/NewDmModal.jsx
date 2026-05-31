import React, { useState, useCallback } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";

export default function NewDmModal({ onClose, onStartDm }) {
  const { user } = useAuth();
  const [targetUser, setTargetUser] = useState("");
  const [error, setError] = useState("");

  const handleStart = useCallback(async () => {
    setError("");
    const target = targetUser.trim();
    if (!target) { setError("请输入用户名"); return; }
    if (target === user.username) { setError("不能给自己发消息"); return; }
    const { data: exists } = await supabase.from("users").select("username").eq("username", target).maybeSingle();
    if (!exists) { setError("用户不存在"); return; }
    onStartDm(target);
  }, [targetUser, user, onStartDm]);

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <div className="auth-top">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>新建私信</h3>
          <button className="auth-close" onClick={onClose}>✕</button>
        </div>
        <div className="auth-body" style={{ paddingTop: 16 }}>
          <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>输入对方用户名，开始端到端加密对话</p>
          <input className="auth-input" type="text" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="输入用户名..." autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }} />
          {error && <div className="auth-err">{error}</div>}
          <button className="auth-btn" onClick={handleStart} disabled={!targetUser.trim()}>开始对话</button>
        </div>
      </div>
    </div>
  );
}
