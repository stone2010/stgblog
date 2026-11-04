import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getBlockedSet, getMutedSet, formatTimeShort, formatCount } from "../utils";
import { mdToPlain } from "../md";
import { pickCopy } from "./EditorialChrome";
import PostCard from "./PostCard";
import ComposeBar from "./ComposeBar";
import { EditorialHero, EditorialInterlude, EditorialAbout, EditorialFooter } from "./EditorialChrome";
import { supabase } from "../supabase";

const TABS = ["帖子", "提问站", "长文站"];

function isQuestion(p) { return p.category === "提问"; }
function isLongform(p) { return (p.category || "").startsWith("长文"); }

// ─── 提问卡片 ───
function QuestionCard({ post, answerCount, onSelect }) {
  return (
    <article className="post q-card" onClick={() => onSelect(post)}>
      <div className="q-head">
        <span className="q-badge">Q</span>
        <span className="q-title">{post.title || post.content}</span>
      </div>
      {post.content && post.title && post.content !== post.title && (
        <div className="q-detail">{post.content.slice(0, 120)}{post.content.length > 120 ? "…" : ""}</div>
      )}
      <div className="q-meta">
        <span className="post-author" onClick={(e) => { e.stopPropagation(); onSelect({ author: post.author }, "profile"); }}>{post.author}</span>
        <span className="post-dot">·</span>
        <span>{formatTimeShort(post.created_at)}</span>
        <span className="q-actions">
          <span className="q-count">💬 {formatCount(answerCount || 0)} 回答</span>
          <span className="q-count">👍 {formatCount(post.likes || 0)}</span>
          <span className="q-count">👀 {formatCount(post.views || 0)}</span>
        </span>
      </div>
    </article>
  );
}

// ─── 长文卡片 ───
function LongFormCard({ post, onSelect }) {
  const isMd = post.category === "长文MD";
  const snippet = mdToPlain(post.content, 110);
  const readMin = Math.max(1, Math.round((post.content || "").length / 400));
  return (
    <article className="post lf-card" onClick={() => onSelect(post)}>
      <div className="lf-head">
        <span className={`lf-badge ${isMd ? "md" : ""}`}>{isMd ? "MD" : "文本"}</span>
        <div className="lf-title">{post.title}</div>
      </div>
      <div className="lf-snippet">{snippet}</div>
      <div className="lf-meta">
        <span className="post-author" onClick={(e) => { e.stopPropagation(); onSelect({ author: post.author }, "profile"); }}>{post.author}</span>
        <span className="post-dot">·</span>
        <span>{formatTimeShort(post.created_at)}</span>
        <span className="post-dot">·</span>
        <span>约 {readMin} 分钟</span>
        <span className="q-actions">
          <span className="q-count">👍 {formatCount(post.likes || 0)}</span>
          <span className="q-count">👀 {formatCount(post.views || 0)}</span>
        </span>
      </div>
    </article>
  );
}

// ─── 长文发布弹窗 ───
function LongFormModal({ open, onClose, onPublish, publishing }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isMd, setIsMd] = useState(true);
  if (!open) return null;
  return (
    <div className="lf-overlay" onClick={onClose}>
      <div className="lf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lf-modal-head">
          <span className="lf-modal-title">写长文</span>
          <button className="lf-close" onClick={onClose}>✕</button>
        </div>
        <input className="lf-title-input" placeholder="文章标题…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <textarea className="lf-text-input" placeholder={isMd ? "支持 Markdown：# 标题、**加粗**、`代码`、> 引用、- 列表、[链接](url)…" : "用普通文本书写，支持话题 #标签# 与 @提及…"} value={text} onChange={(e) => setText(e.target.value)} rows={14} />
        <div className="lf-modal-foot">
          <div className="seg-bar lf-format-seg">
            <button className={`seg ${isMd ? "on" : ""}`} onClick={() => setIsMd(true)}>Markdown</button>
            <button className={`seg ${!isMd ? "on" : ""}`} onClick={() => setIsMd(false)}>普通文本</button>
          </div>
          <span className="lf-char-count">{text.length} 字</span>
          <button className="lf-publish" disabled={publishing || !title.trim() || !text.trim()} onClick={() => onPublish({ title, content: text, isMd })}>
            {publishing ? "发布中…" : "发布长文"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomeFeed({
  posts, postsLoading, hasMore, loadMorePosts, tab, setTab, searchKey,
  composeText, setComposeText, onPublish, publishing, composeRef,
  isAnnouncement, onAnnouncementChange,
  onSelectPost, onLike, onShare, onRepost, onBookmark, onHashtag, onAuthOpen,
  onAsk, onPublishLongForm,
}) {
  const { user, styleMode } = useAuth();
  const sentinelRef = useRef(null);
  const editorial = styleMode === "editorial";
  const [qCounts, setQCounts] = useState({});
  const [lfOpen, setLfOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [tagline] = useState(pickCopy); // 经典模式顶部的轮换文案

  const displayedPosts = useMemo(() => {
    const kw = searchKey.trim().toLowerCase();
    const blocked = getBlockedSet();
    const muted = getMutedSet();
    let f = posts.filter((p) => {
      if (blocked.has(p.author)) return false;
      if (muted.has(p.author)) return false;
      if (kw && ![p.title, p.content, p.author, p.category].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
    if (tab === "提问站") return f.filter((p) => isQuestion(p)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (tab === "长文站") return f.filter((p) => isLongform(p)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return f.filter((p) => !isQuestion(p) && !isLongform(p)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, searchKey, tab]);

  // 提问站:批量拉取回答数
  useEffect(() => {
    if (tab !== "提问站" || displayedPosts.length === 0) { return; }
    const ids = displayedPosts.map((p) => p.id);
    let alive = true;
    supabase.from("comments").select("post_id").in("post_id", ids).then(({ data }) => {
      if (!alive) return;
      const m = {};
      (data || []).forEach((r) => { m[r.post_id] = (m[r.post_id] || 0) + 1; });
      setQCounts((prev) => ({ ...prev, ...m }));
    });
    return () => { alive = false; };
  }, [tab, posts]);

  // Infinite scroll: observe sentinel at bottom
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !postsLoading) {
          loadMorePosts();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, postsLoading, loadMorePosts]);

  const handleAsk = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    if (!user) { onAuthOpen?.(); return; }
    setAsking(true);
    await onAsk(q);
    setAsking(false);
    setQuestion("");
  }, [question, user, onAsk, onAuthOpen]);

  const cards = displayedPosts.map((post) => {
    if (isQuestion(post)) return <QuestionCard key={post.id} post={post} answerCount={qCounts[post.id]} onSelect={onSelectPost} />;
    if (isLongform(post)) return <LongFormCard key={post.id} post={post} onSelect={onSelectPost} />;
    return <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} onHashtag={onHashtag} />;
  });

  const tabsRowEl = (
    <div className="feed-tabs">
      {TABS.map((t) => (
        <button key={t} className={`feed-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>
      ))}
    </div>
  );

  const listBlock = (
    <>
      {postsLoading && <div className="loader" />}
      {!postsLoading && displayedPosts.length === 0 && (
        <div className="empty-state">
          <div className="icon">{tab === "提问站" ? "❓" : tab === "长文站" ? "📄" : "📝"}</div>
          <h3>{tab === "提问站" ? "还没有提问" : tab === "长文站" ? "还没有长文" : "暂无内容"}</h3>
          <p>{tab === "提问站" ? "提出第一个问题，等待大家回答" : tab === "长文站" ? "写第一篇长文，支持 Markdown 排版" : "登录后发帖互动"}</p>
          <button className="empty-state-btn" onClick={() => { if (!user) onAuthOpen?.(); else if (tab === "长文站") setLfOpen(true); }}>
            <span>{tab === "提问站" ? "❓ 提问" : tab === "长文站" ? "📄 写长文" : "➕ 发布帖子"}</span>
          </button>
        </div>
      )}
      {cards}
    </>
  );

  // ── 各频道的发帖区 ──
  let composer = null;
  if (tab === "帖子") {
    composer = <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} publishing={publishing} composeRef={composeRef} isAnnouncement={isAnnouncement} onAnnouncementChange={onAnnouncementChange} />;
  } else if (tab === "提问站") {
    composer = (
      <div className="ask-bar">
        <input
          className="ask-input" placeholder={user ? "提出你的问题，比如「如何坚持长期写作？」" : "登录后提问"}
          value={question} maxLength={100}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
        />
        <button className="ask-btn" disabled={asking || !question.trim()} onClick={handleAsk}>{asking ? "…" : "提问"}</button>
      </div>
    );
  } else if (tab === "长文站") {
    composer = (
      <div className="lf-entry">
        <button className="lf-entry-btn" onClick={() => { if (!user) { onAuthOpen?.(); return; } setLfOpen(true); }}>✍️ 写长文</button>
        <span className="lf-entry-hint">支持 Markdown 与普通文本排版</span>
      </div>
    );
  }

  // ── 编辑部模式:艺术外框 + 同一套三频道信息流 ──
  if (editorial) {
    return (
      <>
        <EditorialHero />
        <div className="ed-section-intro">
          <h2 className="ed-micro">01 / Selected writing</h2>
          <p className="ed-serif-italic">Notes from the desk</p>
        </div>
        <div className="ed-archive-tools">
          <div className="feed-tabs ed-filters">
            {TABS.map((t) => (
              <button key={t} className={`feed-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="ed-count ed-micro">{displayedPosts.length} ENTRIES</div>
        </div>
        <div className="feed ed-feed">
          {composer}
          {listBlock}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {hasMore && !postsLoading && displayedPosts.length > 0 && (
            <div className="ed-load-more ed-micro">Loading more entries ↓</div>
          )}
        </div>
        <EditorialInterlude />
        <EditorialAbout />
        <EditorialFooter />
        <LongFormModal open={lfOpen} onClose={() => setLfOpen(false)} onPublish={async (payload) => { await onPublishLongForm(payload); setLfOpen(false); }} publishing={publishing} />
      </>
    );
  }

  return (
    <>
      <div className="feed-header">
        {tabsRowEl}
      </div>
      <div className="feed">
        <div className="feed-tagline" title="每次刷新都会换一条">{tagline}</div>
        {composer}
        {listBlock}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {hasMore && !postsLoading && displayedPosts.length > 0 && (
          <div style={{ textAlign: "center", padding: 16, color: "var(--muted)", fontSize: 13 }}>加载更多...</div>
        )}
      </div>
      <LongFormModal open={lfOpen} onClose={() => setLfOpen(false)} onPublish={async (payload) => { await onPublishLongForm(payload); setLfOpen(false); }} publishing={publishing} />
    </>
  );
}
