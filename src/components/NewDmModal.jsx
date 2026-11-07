import React, { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { avatarColor } from "../utils";

/* 新建私信：可搜索用户列表点选，也可直接输入用户名回车
   流程：选中/输入目标 → 查询存在性 → 检查对方私信隐私（可能需要密钥）→ 开始对话 */
export default function NewDmModal({ onClose, onStartDm }) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]); // 用户列表
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false); // 防重复提交
  const [needKey, setNeedKey] = useState(false);
  const [targetDmKey, setTargetDmKey] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [dmKeyInput, setDmKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const searchSeq = useRef(0);

  // 加载候选用户：有关键词时服务端模糊搜索，否则拉最近用户
  useEffect(() => {
    let alive = true;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      setListLoading(true);
      const q = query.trim();
      let req = supabase.from("users").select("username, bio").neq("username", user?.username || "").order("username").limit(30);
      if (q) req = req.ilike("username", `%${q}%`);
      const { data } = await req;
      if (!alive || seq !== searchSeq.current) return;
      setCandidates(data || []);
      setListLoading(false);
    }, 220); // 输入防抖
    return () => { alive = false; clearTimeout(t); };
  }, [query, user]);

  const handleStart = useCallback(async (rawTarget) => {
    setError("");
    const target = String(rawTarget ?? query).trim();
    if (!target) { setError("请输入用户名"); return; }
    if (target === user?.username) { setError("不能给自己发消息"); return; }
    setStarting(true);
    try {
      // 1) 确认用户存在（只查 username，避免列缺失报错）
      const { data: exists } = await supabase.from("users").select("username").eq("username", target).maybeSingle();
      if (!exists) { setError("用户不存在"); return; }
      // 2) 检查对方私信隐私（列可能不存在则跳过）
      try {
        const { data: privacy } = await supabase.from("users").select("dm_privacy, dm_key").eq("username", target).maybeSingle();
        if (privacy?.dm_privacy === "key_required") {
          setNeedKey(true);
          setTargetDmKey(privacy.dm_key || "");
          setTargetUser(target);
          return;
        }
      } catch { /* dm_privacy/dm_key 列可能不存在 */ }
      onStartDm(target);
    } finally {
      setStarting(false);
    }
  }, [query, user, onStartDm]);

  const handleVerifyKey = useCallback(() => {
    setKeyError("");
    if (!dmKeyInput.trim()) { setKeyError("请输入私信密钥"); return; }
    if (dmKeyInput.trim() !== targetDmKey) { setKeyError("密钥不正确"); return; }
    onStartDm(targetUser);
  }, [dmKeyInput, targetDmKey, targetUser, onStartDm]);

  const backToList = () => { setNeedKey(false); setDmKeyInput(""); setKeyError(""); };

  return (
    <div className="auth-overlay" onClick={onClose}>
      <div className="auth-modal ndm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-top">
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{needKey ? "需要私信密钥" : "新建私信"}</h3>
          <button className="auth-close" onClick={onClose}>✕</button>
        </div>
        <div className="auth-body" style={{ paddingTop: 12 }}>
          {needKey ? (
            <>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {targetUser} 设置了私信密钥保护，请输入对方的密钥才能开始对话
              </p>
              <input className="auth-input" type="text" value={dmKeyInput} onChange={(e) => setDmKeyInput(e.target.value)}
                placeholder="输入私信密钥..." autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleVerifyKey(); }} />
              {keyError && <div className="auth-err">{keyError}</div>}
              <button className="auth-btn" onClick={handleVerifyKey} disabled={!dmKeyInput.trim()}>验证并开始对话</button>
              <button type="button" className="auth-switch" style={{ marginTop: 12, width: "100%", textAlign: "center", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13 }} onClick={backToList}>
                ← 返回选择用户
              </button>
            </>
          ) : (
            <>
              <input className="auth-input" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索用户名，或输入完整用户名后回车…" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }} />
              {error && <div className="auth-err">{error}</div>}
              <div className="ndm-list">
                {listLoading && <div className="ndm-hint">搜索中…</div>}
                {!listLoading && candidates.length === 0 && (
                  <div className="ndm-hint">没有匹配的用户——确认用户名后直接按回车发起对话</div>
                )}
                {candidates.map((u) => (
                  <button type="button" key={u.username} className="ndm-item" onClick={() => handleStart(u.username)} disabled={starting}>
                    <span className="ndm-avatar" style={{ background: avatarColor(u.username) }}>{u.username[0]}</span>
                    <span className="ndm-info">
                      <span className="ndm-name">{u.username}</span>
                      {u.bio && <span className="ndm-bio">{u.bio.slice(0, 40)}</span>}
                    </span>
                    <span className="ndm-arrow">›</span>
                  </button>
                ))}
              </div>
              <button className="auth-btn" onClick={() => handleStart()} disabled={!query.trim() || starting}>
                {starting ? "检查中…" : "开始对话"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
