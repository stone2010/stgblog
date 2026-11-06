import React, { useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getBlockedSet, getMutedSet } from "../utils";
import { pickCopy } from "./EditorialChrome";
import PostCard from "./PostCard";
import ComposeBar from "./ComposeBar";
import { EditorialInterlude, EditorialAbout, EditorialFooter } from "./EditorialChrome";

/* 主页 —— 短帖子信息流(独立一级入口)
   提问 → QuestionsPage,长文 → BlogPage(2026-11 三模块重构) */

function isQuestion(p) { return p.category === "提问"; }
function isLongform(p) { return (p.category || "").startsWith("长文"); }

export default function HomeFeed({
  posts, postsLoading, hasMore, loadMorePosts, searchKey,
  composeText, setComposeText, onPublish, publishing, composeRef,
  isAnnouncement, onAnnouncementChange,
  onSelectPost, onLike, onShare, onRepost, onBookmark, onHashtag, onAuthOpen,
}) {
  const { styleMode } = useAuth();
  const sentinelRef = useRef(null);
  const editorial = styleMode === "editorial";
  const [tagline] = useState(pickCopy); // 轮换文案,每次刷新换一条

  const displayedPosts = useMemo(() => {
    const kw = searchKey.trim().toLowerCase();
    const blocked = getBlockedSet();
    const muted = getMutedSet();
    return posts.filter((p) => {
      if (isQuestion(p) || isLongform(p)) return false; // 帖子流只含短帖
      if (blocked.has(p.author)) return false;
      if (muted.has(p.author)) return false;
      if (kw && ![p.title, p.content, p.author, p.category].join(" ").toLowerCase().includes(kw)) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, searchKey]);

  // Infinite scroll: observe sentinel at bottom
  React.useEffect(() => {
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

  const listBlock = (
    <>
      {postsLoading && <div className="loader" />}
      {!postsLoading && displayedPosts.length === 0 && (
        <div className="empty-state">
          <div className="icon">📝</div>
          <h3>暂无内容</h3>
          <p>登录后发帖互动，或切换到「提问」「博客」看看</p>
          <button className="empty-state-btn" onClick={() => composeRef.current?.focus()}>
            <span>➕ 发布帖子</span>
          </button>
        </div>
      )}
      {displayedPosts.map((post) => (
        <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} onHashtag={onHashtag} />
      ))}
    </>
  );

  const composer = (
    <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} publishing={publishing} composeRef={composeRef} isAnnouncement={isAnnouncement} onAnnouncementChange={onAnnouncementChange} />
  );

  // ── 编辑部模式:与经典版同结构(顶部艺术块已按反馈移除),仅保留纸感配色与底部落款 ──
  if (editorial) {
    return (
      <>
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
      </>
    );
  }

  return (
    <div className="pageblock">
      <div className="pageintro">
        <div>
          <div className="eyebrow">SHORT POSTS</div>
          <h1>主页</h1>
        </div>
        <p>简短记录、随手想法与日常更新。</p>
      </div>
      <div className="feed">
        <div className="feed-tagline" title="每次刷新都会换一条">{tagline}</div>
        {composer}
        {listBlock}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {hasMore && !postsLoading && displayedPosts.length > 0 && (
          <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: 13 }}>加载更多...</div>
        )}
      </div>
    </div>
  );
}
