import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getBlockedSet, getMutedSet } from "../utils";
import { pickCopy } from "./EditorialChrome";
import PostCard from "./PostCard";
import ComposeBar from "./ComposeBar";
import { EditorialInterlude, EditorialAbout, EditorialFooter } from "./EditorialChrome";

/* 主页 —— 短帖子信息流(独立一级入口,分页浏览)
   提问 → QuestionsPage,长文 → BlogPage(2026-11 三模块重构) */

const PAGE_SIZE = 10;

function isQuestion(p) { return p.category === "提问"; }
function isLongform(p) { return (p.category || "").startsWith("长文"); }

export default function HomeFeed({
  posts, postsLoading, hasMore, loadMorePosts, searchKey,
  composeText, setComposeText, onPublish, publishing, composeRef,
  isAnnouncement, onAnnouncementChange,
  onSelectPost, onLike, onShare, onRepost, onBookmark, onHashtag, onAuthOpen,
}) {
  const { styleMode } = useAuth();
  const editorial = styleMode === "editorial";
  const [tagline] = useState(pickCopy); // 轮换文案,每次刷新换一条
  const [pageIndex, setPageIndex] = useState(0);

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

  const totalPages = Math.max(1, Math.ceil(displayedPosts.length / PAGE_SIZE));
  const safeIndex = Math.min(pageIndex, totalPages - 1);
  const pagePosts = displayedPosts.slice(safeIndex * PAGE_SIZE, safeIndex * PAGE_SIZE + PAGE_SIZE);

  // 搜索词变化时回到第一页
  useEffect(() => { setPageIndex(0); }, [searchKey]);

  // 翻到已加载数据的末页且数据库还有更多时,预取下一批
  useEffect(() => {
    if (hasMore && !postsLoading && (safeIndex + 1) * PAGE_SIZE >= displayedPosts.length) {
      loadMorePosts();
    }
  }, [safeIndex, hasMore, postsLoading, displayedPosts.length, loadMorePosts]);

  const gotoPage = (i) => {
    setPageIndex(Math.min(Math.max(0, i), totalPages - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const listBlock = (
    <>
      {postsLoading && displayedPosts.length === 0 && <div className="loader" />}
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
      {pagePosts.map((post) => (
        <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} onHashtag={onHashtag} />
      ))}
      {displayedPosts.length > PAGE_SIZE && (
        <div className="pg-bar">
          <button className="pg-btn" disabled={safeIndex === 0} onClick={() => gotoPage(safeIndex - 1)}>← 上一页</button>
          <span className="pg-info">第 {safeIndex + 1} / {totalPages} 页</span>
          <button className="pg-btn" disabled={safeIndex >= totalPages - 1 && !hasMore} onClick={() => gotoPage(safeIndex + 1)}>下一页 →</button>
        </div>
      )}
    </>
  );

  const composer = (
    <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} publishing={publishing} composeRef={composeRef} isAnnouncement={isAnnouncement} onAnnouncementChange={onAnnouncementChange} />
  );

  // ── 编辑部模式:与经典版同结构(顶部艺术块已按反馈移除),分页后接底部落款 ──
  if (editorial) {
    return (
      <div className="pageblock">
        <div className="feed ed-feed">
          {composer}
          {listBlock}
        </div>
        <EditorialInterlude />
        <EditorialAbout />
        <EditorialFooter />
      </div>
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
      </div>
    </div>
  );
}
