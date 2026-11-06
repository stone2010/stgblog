import React, { useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { formatTimeShort, avatarColor } from "../utils";

const CheckSingle = () => (
  <svg viewBox="0 0 16 11" width="14" height="10" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckDouble = () => (
  <svg viewBox="0 0 21 11" width="18" height="10" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M1 5.5L5.5 10L14.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 5.5L10.5 10L19.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function DmListPage({ dmList, onOpenDm, onNewDm, onTogglePin, onDeleteConversation, onSetNickname, onOpenGroups }) {
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameTarget, setNicknameTarget] = useState(null);
  const longPressTimer = useRef(null);

  const listWithUnread = useMemo(() => {
    try {
      if (!user || !Array.isArray(dmList)) return dmList || [];
      return dmList.map((item) => {
        if (!item || !item.last) return { other: item?.other || '?', last: item?.last || null, isUnread: false, pinned: item?.pinned || false, nickname: item?.nickname || "" };
        return {
          other: item.other,
          last: item.last,
          isUnread: item.last.receiver === user.username && !item.last.read,
          pinned: item.pinned || false,
          nickname: item.nickname || "",
        };
      });
    } catch (e) {
      console.error("DmListPage error:", e);
      setError(e.message);
      return [];
    }
  }, [dmList, user]);

  const handlePointerDown = useCallback((e, other) => {
    const rect = e.currentTarget.getBoundingClientRect();
    longPressTimer.current = setTimeout(() => {
      setContextMenu({
        x: Math.min(e.clientX || rect.left + 60, window.innerWidth - 160),
        y: Math.min(e.clientY || rect.bottom, window.innerHeight - 120),
        other,
      });
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  if (error) {
    return (
      <div className="dm-list">
        <div className="dm-header"><h3>私信</h3></div>
        <div className="empty-state"><div className="icon">⚠️</div><h3>加载出错</h3><p>{error}</p></div>
      </div>
    );
  }

  return (
    <div className="dm-list" onClick={closeContextMenu}>
      <div className="dm-header">
        <h3>私信</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onOpenGroups && <button className="dm-new-btn" onClick={onOpenGroups} title="群组" style={{ fontSize: 16 }}>👥</button>}
          <button className="dm-new-btn" onClick={onNewDm}>✏️</button>
        </div>
      </div>
      {!user ? (
        <div className="empty-state"><div className="icon">🔒</div><h3>登录后查看私信</h3><p>端到端加密保护你的隐私</p></div>
      ) : listWithUnread.length === 0 ? (
        <div className="empty-state"><div className="icon">💬</div><h3>暂无私信</h3><p>点击右上角 ✏️ 开始对话</p></div>
      ) : listWithUnread.map(({ other, last, isUnread, pinned, nickname }) => (
        <div
          key={other}
          className={`dm-item ${isUnread ? "dm-unread-item" : ""} ${pinned ? "dm-pinned-item" : ""}`}
          onClick={() => onOpenDm(other)}
          onPointerDown={(e) => handlePointerDown(e, other)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, other });
          }}
        >
          <div className="dm-avatar" style={{ background: avatarColor(other) }}>{other?.[0] || '?'}</div>
          <div className="dm-info">
            <div className="dm-name">
              {nickname || other}
              {pinned && <span className="dm-pin-icon">📌</span>}
              {!nickname && <button className="dm-set-nickname" onClick={(e) => { e.stopPropagation(); setNicknameTarget(other); setNicknameInput(""); }}>✏️</button>}
            </div>
            <div className="dm-preview" style={isUnread ? { fontWeight: 600, color: "var(--text)" } : {}}>
              {!last ? "新对话" : last.encrypted ? "🔒 加密消息" : (last.content || "暂无消息")}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div className="dm-time">{last ? formatTimeShort(last.created_at) : ""}</div>
            {last?.sender === user.username && (
              <span className={`dm-tick ${last?.read ? "read" : "sent"}`}>
                {last?.read ? <CheckDouble /> : <CheckSingle />}
              </span>
            )}
            {isUnread && <div className="dm-unread-dot" />}
          </div>
        </div>
      ))}

      {/* Context Menu (long press / right click) */}
      {contextMenu && (
        <div className="dm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { onTogglePin?.(contextMenu.other); setContextMenu(null); }}>
            {listWithUnread.find((c) => c.other === contextMenu.other)?.pinned ? "📌 取消置顶" : "📌 置顶对话"}
          </button>
          <button onClick={() => { setNicknameTarget(contextMenu.other); setNicknameInput(""); setContextMenu(null); }}>
            ✏️ 设置备注
          </button>
          <div className="menu-divider" />
          <button className="dm-context-delete" onClick={() => { onDeleteConversation?.(contextMenu.other); setContextMenu(null); }}>
            🗑️ 删除对话
          </button>
        </div>
      )}

      {/* Nickname input overlay */}
      {nicknameTarget && (
        <div className="dm-nickname-overlay" onClick={() => setNicknameTarget(null)}>
          <div className="dm-nickname-box">
            <h3>设置备注</h3>
            <p>为 {nicknameTarget} 设置显示名称</p>
            <input className="dm-nickname-input" autoFocus value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} maxLength="20" />
            <div className="dm-nickname-actions">
              <button className="dm-nickname-cancel" onClick={() => { setNicknameTarget(null); setNicknameInput(""); }}>取消</button>
              <button className="dm-nickname-ok" onClick={() => { onSetNickname?.(nicknameTarget, nicknameInput); setNicknameTarget(null); setNicknameInput(""); }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
