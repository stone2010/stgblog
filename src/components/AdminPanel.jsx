import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGrowth } from "../context/GrowthContext";
import { showToast } from "../utils";
import IdentityMark from "./IdentityMark";

function fmt(s) {
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// 管理员模式：入口在右侧边栏，仅服务端 users.is_admin=true 时才出现。
// 所有动作都走 SECURITY DEFINER RPC 并重新校验身份；提权仅超管 Stone 可用。
export default function AdminPanel({ onBack }) {
  const { user } = useAuth();
  const growth = useGrowth();
  const [tab, setTab] = useState("posts");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const s = growth.state;
  const ov = growth.admin.overview;

  // 切换页签时清空搜索词，避免「在帖子页搜过的词」带到账号页造成空列表
  const switchTab = (t) => { setTab(t); setQ(""); setErr(""); };

  const act = async (key, fn, args, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key); setErr("");
    const res = await growth.admin.act(fn, args);
    if (res.error) { setErr(res.error); showToast(res.error, 3400); }
    else showToast("✅ 操作已记录到管理员日志", 2400);
    setBusy("");
  };

  if (!user) return <div className="growth-hint">请先登录。</div>;
  if (growth.ready === false) return (
    <div className="growth-hint"><b>管理员模式尚未启用</b><p>需要管理员执行 <code>migrations/v13_growth.sql</code>。</p></div>
  );
  if (s && !s.is_admin) return (
    <div className="growth-hint"><b>无访问权限</b><p>管理员模式只对服务端标记为管理员的账号开放。</p></div>
  );
  if (!ov) return <div className="growth-hint">正在加载管理数据…</div>;

  // 本地过滤：管理数据一次性取回（帖子 40 条 / 用户 60 条），搜索无需再打服务端。
  const kw = q.trim().toLowerCase();
  const posts = (ov.posts || []).filter((p) => !kw
    || String(p.author || "").toLowerCase().includes(kw)
    || String(p.content || "").toLowerCase().includes(kw));
  const users = (ov.users || []).filter((u) => !kw
    || String(u.username || "").toLowerCase().includes(kw));

  return (
    <div className="admin-panel">
      <div className="admin-top">
        <button className="detail-back" onClick={onBack} aria-label="返回">←</button>
        <div>
          <h2>管理员模式 <IdentityMark kind="admin" size={18} /></h2>
          <p>操作者 {ov.actor}{ov.is_super ? " · 超级管理员" : " · 管理员"} · 所有操作留痕可追溯</p>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={tab === "posts" ? "on" : ""} onClick={() => switchTab("posts")}>帖子评审</button>
        <button className={tab === "users" ? "on" : ""} onClick={() => switchTab("users")}>账号管理</button>
        <button className={tab === "log" ? "on" : ""} onClick={() => switchTab("log")}>操作日志</button>
      </div>

      {tab !== "log" && (
        <div className="admin-search">
          <span className="admin-search-icon" aria-hidden="true">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "posts" ? "搜索作者或正文关键词…" : "搜索用户名…"}
            aria-label={tab === "posts" ? "搜索帖子" : "搜索用户"}
          />
          {q && <button className="admin-search-clear" onClick={() => setQ("")} aria-label="清空搜索">✕</button>}
          <span className="admin-search-count">
            {tab === "posts" ? `${posts.length}/${(ov.posts || []).length}` : `${users.length}/${(ov.users || []).length}`} 条
          </span>
        </div>
      )}

      {err && <div className="growth-warn">{err}</div>}

      <div className="admin-scroll">
        {tab === "posts" && (
          <ul className="admin-list">
            {posts.map((p) => (
              <li key={p.id}>
                <div className="admin-row-main">
                  <b>{p.author}</b>
                  {p.is_announcement && <span className="admin-tag">公告</span>}
                  {p.is_featured && <span className="admin-tag gold">精华</span>}
                  <small>{fmt(p.created_at)}</small>
                </div>
                <p className="admin-row-sub">{p.content || "（无正文）"}</p>
                <div className="admin-actions">
                  <button disabled={busy === `f${p.id}`}
                    onClick={() => act(`f${p.id}`, "admin_feature_post", { p_post_id: p.id, p_featured: !p.is_featured })}>
                    {p.is_featured ? "取消精华" : "设为精华"}
                  </button>
                  <button className="danger" disabled={busy === `d${p.id}`}
                    onClick={() => act(`d${p.id}`, "admin_delete_post", { p_post_id: p.id }, `确定删除 ${p.author} 的这条内容？该操作不可撤销。`)}>
                    删除帖子
                  </button>
                </div>
              </li>
            ))}
            {!posts.length && <li className="admin-empty">{kw ? "没有匹配的帖子，换个关键词试试。" : "暂无帖子"}</li>}
          </ul>
        )}

        {tab === "users" && (
          <ul className="admin-list">
            {users.map((u) => (
              <li key={u.username}>
                <div className="admin-row-main">
                  <b>{u.username}</b>
                  {u.is_admin && <IdentityMark kind="admin" size={14} />}
                  {u.is_banned && <span className="admin-tag red">已封禁</span>}
                  <small>{fmt(u.created_at)}</small>
                </div>
                <div className="admin-actions">
                  <button disabled={busy === `b${u.username}` || u.username === "Stone"}
                    onClick={() => act(`b${u.username}`, "admin_ban_user",
                      { p_username: u.username, p_banned: !u.is_banned, p_reason: "违反社区规范" },
                      u.is_banned ? `确定解封 ${u.username}？` : `确定封禁 ${u.username}？该账号将无法发帖和评论。`)}>
                    {u.is_banned ? "解封账号" : "封禁账号"}
                  </button>
                  {ov.is_super && u.username !== "Stone" && (
                    <button disabled={busy === `p${u.username}`}
                      onClick={() => act(`p${u.username}`, "admin_promote",
                        { p_username: u.username, p_admin: !u.is_admin },
                        u.is_admin ? `确定撤销 ${u.username} 的管理员权限？` : `确定把 ${u.username} 提升为管理员？`)}>
                      {u.is_admin ? "撤销提权" : "提升为管理员"}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {!users.length && <li className="admin-empty">{kw ? "没有匹配的用户，换个关键词试试。" : "暂无用户"}</li>}
          </ul>
        )}

        {tab === "log" && (
          <ul className="admin-list admin-log">
            {(ov.log || []).map((l, i) => (
              <li key={i}>
                <div className="admin-row-main"><b>{l.actor}</b><span className="admin-tag">{l.action}</span><small>{fmt(l.created_at)}</small></div>
                <p className="admin-row-sub">目标：{l.target_id || "—"}</p>
              </li>
            ))}
            {!(ov.log || []).length && <li className="admin-empty">暂无操作记录</li>}
          </ul>
        )}
      </div>
      <p className="growth-foot">权限边界：删帖 / 加精 / 封禁对所有管理员开放；调整管理员权限仅超管 Stone 可用，且不能修改 Stone 自身。</p>
    </div>
  );
}
