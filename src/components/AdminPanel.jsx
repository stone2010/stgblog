import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useGrowth } from "../context/GrowthContext";
import { supabase } from "../supabase";
import { showToast } from "../utils";
import { FEATURED_XP, GRANT_MAX, GRANT_PRESETS } from "../growth";
import { levelOf, levelProgress } from "../honors";
import { LevelChip } from "./HonorBadge";
import IdentityMark from "./IdentityMark";

function fmt(s) {
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// 管理员模式：入口在右侧边栏，仅服务端 users.is_admin=true 时才出现。
// 所有动作都走 SECURITY DEFINER RPC 并重新校验身份；提权与发经验仅超级管理员（user_no=1）可用。
//
// 搜索说明：admin_overview() 只返回「最近 40 篇 / 最近 60 位」用于默认浏览，
// 因此搜索必须查服务端全表，不能在前端过滤这份快照——否则老用户永远搜不到。
export default function AdminPanel({ onBack }) {
  const { user } = useAuth();
  const growth = useGrowth();
  const [tab, setTab] = useState("posts");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);   // 操作成功后让搜索结果重新拉取
  const [remote, setRemote] = useState({ posts: null, users: null, loading: false, error: "" });

  // 经验发放：选人 / 数量 / 理由 / 结果
  const [grantQ, setGrantQ] = useState("");
  const [grantList, setGrantList] = useState(null);   // null=未搜索，用默认快照
  const [grantBusy, setGrantBusy] = useState(false);
  const [picked, setPicked] = useState(null);         // {username, level, total_xp}
  const [amount, setAmount] = useState(50);
  const [reason, setReason] = useState("");
  const [grantMsg, setGrantMsg] = useState("");

  const s = growth.state;
  const ov = growth.admin.overview;
  const isSuper = !!ov?.is_super;

  // 切换页签时清空搜索词，避免「在帖子页搜过的词」带到账号页造成空列表
  const switchTab = (t) => { setTab(t); setQ(""); setErr(""); setGrantMsg(""); };

  const act = async (key, fn, args, confirmText, successText) => {
    if (confirmText && !window.confirm(confirmText)) return null;
    setBusy(key); setErr("");
    const res = await growth.admin.act(fn, args);
    if (res.error) { setErr(res.error); showToast(res.error, 3400); }
    else {
      const msg = typeof successText === "function" ? successText(res.data) : (successText || "✅ 操作已记录到管理员日志");
      showToast(msg, 2800);
      setTick((t) => t + 1);
    }
    setBusy("");
    return res;
  };

  // ─── 服务端全站搜索（防抖 300ms）────────────────────────────────────────
  useEffect(() => {
    const kw = q.trim();
    if (!kw || tab === "log" || tab === "grant") {
      setRemote({ posts: null, users: null, loading: false, error: "" });
      return;
    }
    // PostgREST 的 or= 以逗号分隔条件，过滤掉会破坏语法的字符
    const safe = kw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!safe) { setRemote({ posts: null, users: null, loading: false, error: "" }); return; }

    let alive = true;
    setRemote((r) => ({ ...r, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        if (tab === "posts") {
          const { data, error } = await supabase
            .from("posts")
            .select("id,author,content,created_at,is_featured,is_announcement")
            .or(`author.ilike.%${safe}%,content.ilike.%${safe}%`)
            .order("created_at", { ascending: false })
            .limit(50);
          if (!alive) return;
          if (error) setRemote({ posts: null, users: null, loading: false, error: "搜索失败：" + error.message });
          else setRemote({ posts: data || [], users: null, loading: false, error: "" });
        } else {
          const { data, error } = await supabase
            .from("users")
            .select("username,is_admin,is_banned,created_at")
            .ilike("username", `%${safe}%`)
            .order("created_at", { ascending: false })
            .limit(50);
          if (!alive) return;
          if (error) setRemote({ posts: null, users: null, loading: false, error: "搜索失败：" + error.message });
          else setRemote({ posts: null, users: data || [], loading: false, error: "" });
        }
      } catch (e) {
        if (alive) setRemote({ posts: null, users: null, loading: false, error: "搜索失败：" + (e?.message || "网络错误") });
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, tab, tick]);

  // ─── 经验发放的用户搜索：users 全表（不漏老用户）+ 公开档案补等级/经验 ────
  useEffect(() => {
    if (tab !== "grant") return;
    const kw = grantQ.trim().replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
    if (!kw) { setGrantList(null); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const { data: us } = await supabase
          .from("users").select("username,is_admin,is_banned")
          .ilike("username", `%${kw}%`).order("created_at", { ascending: false }).limit(30);
        if (!alive) return;
        const rows = us || [];
        if (!rows.length) { setGrantList([]); return; }
        const names = rows.map((r) => r.username);
        const { data: gs } = await supabase
          .from("honors_public_profiles").select("username,level,total_xp").in("username", names);
        if (!alive) return;
        const gm = {};
        (gs || []).forEach((g) => { gm[g.username] = g; });
        setGrantList(rows.map((r) => ({
          username: r.username, is_admin: r.is_admin, is_banned: r.is_banned,
          level: gm[r.username]?.level ?? 1, total_xp: gm[r.username]?.total_xp ?? 0,
          hasProfile: !!gm[r.username],
        })));
      } catch { if (alive) setGrantList([]); }
    }, 280);
    return () => { alive = false; clearTimeout(timer); };
  }, [grantQ, tab, tick]);

  if (!user) return <div className="growth-hint">请先登录。</div>;
  if (growth.ready === false) return (
    <div className="growth-hint"><b>管理员模式尚未启用</b><p>需要管理员执行 <code>migrations/v13_growth.sql</code>。</p></div>
  );
  if (s && !s.is_admin) return (
    <div className="growth-hint"><b>无访问权限</b><p>管理员模式只对服务端标记为管理员的账号开放。</p></div>
  );
  if (!ov) return <div className="growth-hint">正在加载管理数据…</div>;

  const searching = q.trim().length > 0 && tab !== "log" && tab !== "grant";
  const snapshotPosts = ov.posts || [];
  const snapshotUsers = ov.users || [];
  const posts = searching ? (remote.posts || []) : snapshotPosts;
  const users = searching ? (remote.users || []) : snapshotUsers;
  const pending = searching && remote.loading;

  // 未搜索时用最近 60 位做候选（admin_overview 已带 level / total_xp）
  const candidates = grantList === null ? snapshotUsers.slice(0, 30) : grantList;
  const grants = (ov.log || []).filter((l) => l.action === "grant_xp").slice(0, 8);

  // 从帖子行/账号行直接跳到发放页。账号行已经带等级，帖子作者可能不在最近 60 位里，
  // 那种情况先占位再从公开档案补一次，避免显示一个假的 0 XP。
  const pickUser = async (username, known) => {
    setGrantMsg("");
    setTab("grant");
    const hit = known || snapshotUsers.find((u) => u.username === username);
    if (hit && hit.total_xp !== undefined) { setPicked(hit); return; }
    setPicked({ username, level: 1, total_xp: 0 });
    try {
      const { data } = await supabase
        .from("honors_public_profiles").select("username,level,total_xp")
        .eq("username", username).limit(1);
      const r = data && data[0];
      if (r) setPicked((prev) => (prev && prev.username === username
        ? { ...prev, level: r.level, total_xp: r.total_xp } : prev));
    } catch { /* 公开档案读不到就保持占位值 */ }
  };

  const pickedProg = picked ? levelProgress(Number(picked.total_xp || 0)) : null;
  const canGrant = !!picked && Number.isFinite(amount) && amount >= 1 && amount <= GRANT_MAX && reason.trim().length > 0;

  const submitGrant = async (sign) => {
    if (!picked || !canGrant) return;
    const xp = sign * Math.round(amount);
    const label = sign > 0 ? `向 ${picked.username} 发放 ${xp} XP？` : `从 ${picked.username} 扣除 ${xp} XP？`;
    if (!window.confirm(`${label}\n理由：${reason.trim()}`)) return;
    setGrantBusy(true); setGrantMsg("");
    const res = await growth.admin.act("admin_grant_xp", {
      p_username: picked.username, p_xp: xp, p_reason: reason.trim(),
    });
    setGrantBusy(false);
    if (res.error) {
      // 前端已上线但服务端还没执行 v14 迁移时，PostgREST 只会给一句 PGRST202，
      // 直接透出去没人看得懂，这里换成可执行的下一步。
      const missing = /schema cache|PGRST202|Could not find|does not exist/i.test(res.error);
      const msg = missing
        ? "服务端还没有 admin_grant_xp，请先在 Supabase SQL Editor 执行 migrations/v14_admin_xp.sql"
        : res.error;
      setGrantMsg("❌ " + msg); showToast(msg, 4000); return;
    }
    const d = res.data || {};
    const lv0 = levelOf(Number(d.before || 0)).level;
    const lv1 = Number(d.level || lv0);
    const msg = `已向 ${d.username || picked.username} ${sign > 0 ? "发放" : "扣除"} ${Math.abs(d.xp || xp)} XP · `
      + `${d.before} → ${d.total_xp} XP · ` + (lv1 === lv0 ? `仍为 Lv.${lv0}` : `Lv.${lv0} → Lv.${lv1}`);
    setGrantMsg("✅ " + msg);
    showToast("✅ " + msg, 3600);
    setPicked({ ...picked, level: lv1, total_xp: Number(d.total_xp ?? picked.total_xp) });
    setReason("");
    setTick((t) => t + 1);
  };

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
        {isSuper && <button className={tab === "grant" ? "on" : ""} onClick={() => switchTab("grant")}>经验发放</button>}
        <button className={tab === "log" ? "on" : ""} onClick={() => switchTab("log")}>操作日志</button>
      </div>

      {tab !== "log" && tab !== "grant" && (
        <>
          <div className={`admin-search${searching ? " is-live" : ""}`}>
            <span className="admin-search-icon" aria-hidden="true">⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === "posts" ? "搜索全站帖子：作者或正文…" : "搜索全站用户名…"}
              aria-label={tab === "posts" ? "搜索帖子" : "搜索用户"}
            />
            {q && <button className="admin-search-clear" onClick={() => setQ("")} aria-label="清空搜索">✕</button>}
            <span className="admin-search-count">
              {pending ? "搜索中…" : searching
                ? `${tab === "posts" ? posts.length : users.length} 条`
                : `${tab === "posts" ? `${posts.length}/${snapshotPosts.length}` : `${users.length}/${snapshotUsers.length}`} 条`}
            </span>
          </div>
          <p className="admin-search-hint">
            {searching
              ? "正在搜索全站数据（最多显示 50 条）"
              : tab === "posts"
                ? `默认只列出最近 ${snapshotPosts.length} 篇，输入关键词可搜索全站`
                : `默认只列出最近 ${snapshotUsers.length} 位，输入关键词可搜索全站`}
          </p>
        </>
      )}

      {(err || remote.error) && <div className="growth-warn">{err || remote.error}</div>}

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
                    onClick={() => act(`f${p.id}`, "admin_feature_post", { p_post_id: p.id, p_featured: !p.is_featured }, null,
                      (d) => (!p.is_featured
                        ? (d && d.xp_awarded > 0
                          ? `✦ 已加精，作者 ${d.author} +${d.xp_awarded} XP`
                          : `✦ 已加精${d && d.xp_note ? "（" + d.xp_note + "）" : ""}`)
                        : "已取消精华（已发放的经验不回收）"))}>
                    {p.is_featured ? "取消精华" : `设为精华 +${FEATURED_XP} XP`}
                  </button>
                  <button className="danger" disabled={busy === `d${p.id}`}
                    onClick={() => act(`d${p.id}`, "admin_delete_post", { p_post_id: p.id }, `确定删除 ${p.author} 的这条内容？该操作不可撤销。`)}>
                    删除帖子
                  </button>
                  {isSuper && (
                    <button className="gold" onClick={() => pickUser(p.author)}>奖励作者</button>
                  )}
                </div>
              </li>
            ))}
            {!posts.length && (
              <li className="admin-empty">
                {pending ? "搜索中…" : searching ? "全站没有匹配的帖子，换个关键词试试。" : "暂无帖子"}
              </li>
            )}
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
                  {u.level !== undefined && (
                    <>
                      <LevelChip level={u.level} compact />
                      <span className="admin-xp">{Number(u.total_xp || 0)} XP</span>
                    </>
                  )}
                  <small>{u.user_no != null ? `ID ${u.user_no} · ` : ""}{fmt(u.created_at)}</small>
                </div>
                <div className="admin-actions">
                  <button disabled={busy === `b${u.username}` || u.user_no === 1}
                    onClick={() => act(`b${u.username}`, "admin_ban_user",
                      { p_username: u.username, p_banned: !u.is_banned, p_reason: "违反社区规范" },
                      u.is_banned ? `确定解封 ${u.username}？` : `确定封禁 ${u.username}？该账号将无法发帖和评论。`)}>
                    {u.is_banned ? "解封账号" : "封禁账号"}
                  </button>
                  {isSuper && (
                    <button className="gold" disabled={busy === `g${u.username}`}
                      onClick={() => pickUser(u.username, { username: u.username, level: u.level ?? 1, total_xp: Number(u.total_xp || 0) })}>
                      发放经验
                    </button>
                  )}
                  {isSuper && u.user_no !== 1 && (
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
            {!users.length && (
              <li className="admin-empty">
                {pending ? "搜索中…" : searching ? "全站没有匹配的用户，换个关键词试试。" : "暂无用户"}
              </li>
            )}
          </ul>
        )}

        {tab === "grant" && (
          <div className="admin-grant">
            <div className="grant-block">
              <div className="grant-label">① 选择用户</div>
              <div className="admin-search">
                <span className="admin-search-icon" aria-hidden="true">⌕</span>
                <input value={grantQ} onChange={(e) => setGrantQ(e.target.value)}
                  placeholder="输入用户名搜索全站…" aria-label="搜索要发放经验的用户" />
                {grantQ && <button className="admin-search-clear" onClick={() => setGrantQ("")} aria-label="清空搜索">✕</button>}
              </div>

              {picked ? (
                <div className="grant-picked">
                  <div className="grant-picked-main">
                    <b>{picked.username}</b>
                    <LevelChip level={picked.level} compact />
                    <span className="grant-picked-xp">{Number(picked.total_xp || 0)} XP</span>
                    <button className="grant-repick" onClick={() => setPicked(null)}>重选</button>
                  </div>
                  {pickedProg && (
                    <p className="grant-picked-hint">
                      {pickedProg.isMax
                        ? `已达最高等级 ${pickedProg.cur.title}`
                        : `${pickedProg.cur.title} · 再获得 ${pickedProg.toNext} XP 升为 ${pickedProg.next.title}`}
                    </p>
                  )}
                </div>
              ) : (
                <ul className="grant-cand">
                  {candidates.map((u) => (
                    <li key={u.username}>
                      <button onClick={() => { setPicked(u); setGrantMsg(""); }}>
                        <span className="grant-cand-name">{u.username}</span>
                        <LevelChip level={u.level ?? 1} compact />
                        <span className="grant-cand-xp">{Number(u.total_xp || 0)} XP</span>
                        {u.is_banned && <span className="admin-tag red">已封禁</span>}
                      </button>
                    </li>
                  ))}
                  {!candidates.length && (
                    <li className="admin-empty">{grantQ ? "没有匹配的用户" : "暂无用户"}</li>
                  )}
                </ul>
              )}
            </div>

            <div className="grant-block">
              <div className="grant-label">② 数量（1 ~ {GRANT_MAX} XP）</div>
              <div className="grant-presets">
                {GRANT_PRESETS.map((v) => (
                  <button key={v} className={amount === v ? "on" : ""} onClick={() => setAmount(v)}>{v}</button>
                ))}
                <input type="number" min="1" max={GRANT_MAX} value={amount} aria-label="自定义经验值"
                  onChange={(e) => setAmount(Math.max(1, Math.min(GRANT_MAX, Math.round(Number(e.target.value) || 1))))} />
              </div>
              <p className="grant-tip">普通主题 8 XP、回复 2 XP、签到 5 XP；精华帖由系统自动 +{FEATURED_XP} XP，不需要在这里发。</p>
            </div>

            <div className="grant-block">
              <div className="grant-label">③ 理由（必填，会写进管理员日志）</div>
              <input className="grant-reason" value={reason} maxLength={60}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：精华帖《…》整理得很清楚，补发奖励" aria-label="发放理由" />
              <div className="grant-reason-count">{reason.length}/60</div>
            </div>

            <div className="grant-actions">
              <button className="grant-primary" disabled={!canGrant || grantBusy}
                onClick={() => submitGrant(1)}>
                {grantBusy ? "处理中…" : `发放 ${amount} XP`}
              </button>
              <button className="grant-deduct" disabled={!canGrant || grantBusy}
                onClick={() => submitGrant(-1)}>
                扣除 {amount} XP
              </button>
            </div>

            {grantMsg && <div className={grantMsg.startsWith("❌") ? "growth-warn" : "grant-result"}>{grantMsg}</div>}

            <div className="grant-block">
              <div className="grant-label">最近发放记录</div>
              {grants.length ? (
                <ul className="grant-log">
                  {grants.map((l, i) => (
                    <li key={i}>
                      <b>{l.target_id}</b>
                      <span className={"grant-log-xp" + (Number(l.detail?.xp) < 0 ? " minus" : "")}>
                        {Number(l.detail?.xp) > 0 ? "+" : ""}{Number(l.detail?.xp || 0)} XP
                      </span>
                      <span className="grant-log-reason">{l.detail?.reason || "—"}</span>
                      <small>{fmt(l.created_at)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="grant-tip">还没有发放记录。</p>
              )}
            </div>
          </div>
        )}

        {tab === "log" && (
          <ul className="admin-list admin-log">
            {(ov.log || []).map((l, i) => (
              <li key={i}>
                <div className="admin-row-main"><b>{l.actor}</b><span className="admin-tag">{l.action}</span><small>{fmt(l.created_at)}</small></div>
                <p className="admin-row-sub">目标：{l.target_id || "—"}{l.detail?.reason ? ` · ${l.detail.reason}` : ""}</p>
              </li>
            ))}
            {!(ov.log || []).length && <li className="admin-empty">暂无操作记录</li>}
          </ul>
        )}
      </div>
      <p className="growth-foot">
        权限边界：删帖 / 加精（加精自动给作者 +{FEATURED_XP} XP）/ 封禁对所有管理员开放；
        发放经验与调整管理员权限仅超级管理员（ID 1）可用，且不能修改超级管理员自身。
      </p>
    </div>
  );
}
