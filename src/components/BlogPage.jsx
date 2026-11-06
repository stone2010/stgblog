import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { formatTimeShort } from "../utils";
import { mdToPlain } from "../md";

/* 博客页 —— 独立一级入口(知乎式文章列表)
   数据约定:posts.category 以 "长文" 开头(长文MD=Markdown / 长文=普通文本)
   点击文章 → 打开独立的文章详情页(PostDetail),详情页自带"← 返回"入口 */

function isLongform(p) { return (p.category || "").startsWith("长文"); }

// 文章封面缩略图:装饰圆环 + 斜体衬线字,三种底色循环(纯 CSS,随主题变色)
const COVER_TITLES = ["Notes & thoughts", "A slower web", "Reading notes", "Fragments", "Long form", "Essays"];

function BlogCard({ post, index, onSelect, onUserClick }) {
  const isMd = post.category === "长文MD";
  const excerpt = mdToPlain(post.content || post.title || "", 96);
  const readMin = Math.max(1, Math.round((post.content || "").length / 400));
  const cover = COVER_TITLES[index % COVER_TITLES.length];
  return (
    <article className="bl-card" onClick={() => onSelect(post)}>
      <div className="bl-main">
        <div className="meta">
          <span className="author" onClick={(e) => { e.stopPropagation(); onUserClick(post.author); }}>{post.author}</span>
          <i className="dot" />
          <span>{formatTimeShort(post.created_at)}</span>
          <span className="pill">{isMd ? "Markdown" : "文章"}</span>
          <span>阅读约 {readMin} 分钟</span>
        </div>
        <h2 className="bl-title">{post.title}</h2>
        <p className="bl-excerpt">{excerpt}</p>
        <span className="readmore">阅读全文 →</span>
      </div>
      <div className="coverthumb"><span>{cover}</span></div>
    </article>
  );
}

// 写长文弹窗(自 HomeFeed 迁入)
export function LongFormModal({ open, onClose, onPublish, publishing }) {
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

export default function BlogPage({ posts, postsLoading, publishing, onPublishLongForm, onSelectPost, onAuthOpen, onUserClick }) {
  const { user } = useAuth();
  const [lfOpen, setLfOpen] = useState(false);

  const articles = useMemo(
    () => posts.filter(isLongform).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [posts]
  );

  return (
    <div className="pageblock">
      <div className="pageintro">
        <div>
          <div className="eyebrow">ARTICLES &amp; JOURNAL</div>
          <h1>博客</h1>
        </div>
        <p>先浏览标题与摘要，选择感兴趣的文章再进入阅读。</p>
      </div>
      <div className="bl-entry">
        <button className="lf-entry-btn" onClick={() => { if (!user) { onAuthOpen?.(); return; } setLfOpen(true); }}>✍️ 写文章</button>
        <span className="lf-entry-hint">支持 Markdown 与普通文本排版</span>
      </div>
      {postsLoading && <div className="loader" />}
      {!postsLoading && articles.length === 0 && (
        <div className="empty-state">
          <div className="icon">📄</div>
          <h3>还没有文章</h3>
          <p>写第一篇长文，支持 Markdown 排版</p>
          <button className="empty-state-btn" onClick={() => { if (!user) { onAuthOpen?.(); return; } setLfOpen(true); }}>
            <span>✍️ 写文章</span>
          </button>
        </div>
      )}
      <div className="bloglist">
        {articles.map((p, i) => (
          <BlogCard key={p.id} post={p} index={i} onSelect={onSelectPost} onUserClick={onUserClick} />
        ))}
      </div>
      <LongFormModal open={lfOpen} onClose={() => setLfOpen(false)} onPublish={async (payload) => { await onPublishLongForm(payload); setLfOpen(false); }} publishing={publishing} />
    </div>
  );
}
