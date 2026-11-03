import React, { useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getHotPosts, getRecommendPosts, getLikedSet, getBlockedSet, getMutedSet, getViewedSet } from "../utils";
import PostCard from "./PostCard";
import ComposeBar from "./ComposeBar";
import { EditorialHero, EditorialInterlude, EditorialAbout, EditorialFooter } from "./EditorialChrome";

export default function HomeFeed({
  posts, postsLoading, hasMore, loadMorePosts, tab, setTab, searchKey,
  composeText, setComposeText, onPublish, publishing, composeRef,
  isAnnouncement, onAnnouncementChange,
  onSelectPost, onLike, onShare, onRepost, onBookmark, onHashtag, onAuthOpen,
}) {
  const { user, followingSet, styleMode } = useAuth();
  const sentinelRef = useRef(null);
  const editorial = styleMode === "editorial";

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
    if (tab === "我的") { if (!user) return []; f = f.filter((p) => p.author === user.username); }
    if (tab === "关注") {
      if (!user) return [];
      f = f.filter((p) => followingSet.has(p.author) || p.author === user.username);
      return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (tab === "热门") return getHotPosts(f);
    if (tab === "推荐") return getRecommendPosts(f, { followingSet, likedPosts: getLikedSet(), viewedPosts: getViewedSet() });
    if (tab === "书签") {
      const bm = new Set(JSON.parse(localStorage.getItem("bookmarkedPosts") || "[]"));
      return f.filter((p) => bm.has(p.id));
    }
    return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, searchKey, tab, user, followingSet]);

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

  const cards = displayedPosts.map((post, i) => (
    <PostCard key={post.id} post={post} index={i} editorial={editorial} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} onHashtag={onHashtag} />
  ));

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
            {["最新", "热门", "推荐", "关注", "书签", "我的"].map((t) => (
              <button key={t} className={`feed-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
          <div className="ed-count ed-micro">{displayedPosts.length} ENTRIES</div>
        </div>
        <div className="feed ed-feed">
          <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} publishing={publishing} composeRef={composeRef} isAnnouncement={isAnnouncement} onAnnouncementChange={onAnnouncementChange} />
          {postsLoading && <div className="loader" />}
          {!postsLoading && displayedPosts.length === 0 && (
            <div className="empty-state">
              <div className="icon">{tab === "书签" ? "🔖" : tab === "关注" ? "👥" : "📝"}</div>
              <h3>{tab === "书签" ? "暂无书签" : tab === "关注" ? "暂无关注内容" : "暂无内容"}</h3>
              <p>{tab === "书签" ? "收藏帖子后会出现在这里" : tab === "关注" ? "关注一些用户后，他们的帖子会出现在这里" : user ? "成为第一个发帖的人" : "登录后发帖互动"}</p>
              {!user ? (
                <button className="empty-state-btn" onClick={() => setAuthOpen(true)}>
                  <span>登录</span> <span>开始使用</span>
                </button>
              ) : (
                <button className="empty-state-btn" onClick={() => composeRef.current?.focus()}>
                  <span>➕ 发布帖子</span>
                </button>
              )}
            </div>
          )}
          <div className="ed-grid">{cards}</div>
          <EditorialInterlude />
          <EditorialAbout />
          <EditorialFooter />
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {hasMore && !postsLoading && displayedPosts.length > 0 && (
            <div className="ed-load-more ed-micro">Loading more entries ↓</div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="feed-header">
        <div className="feed-tabs">
          {["最新", "热门", "推荐", "关注", "书签", "我的"].map((t) => (
            <button key={t} className={`feed-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="feed">
        <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} publishing={publishing} composeRef={composeRef} isAnnouncement={isAnnouncement} onAnnouncementChange={onAnnouncementChange} />
        {postsLoading && <div className="loader" />}
        {!postsLoading && displayedPosts.length === 0 && (
          <div className="empty-state">
            <div className="icon">{tab === "书签" ? "🔖" : tab === "关注" ? "👥" : "📝"}</div>
            <h3>{tab === "书签" ? "暂无书签" : tab === "关注" ? "暂无关注内容" : "暂无内容"}</h3>
            <p>{tab === "书签" ? "收藏帖子后会出现在这里" : tab === "关注" ? "关注一些用户后，他们的帖子会出现在这里" : user ? "成为第一个发帖的人" : "登录后发帖互动"}</p>
            {!user ? (
              <button className="empty-state-btn" onClick={() => setAuthOpen(true)}>
                <span>登录</span> <span>开始使用</span>
              </button>
            ) : (
              <button className="empty-state-btn" onClick={() => composeRef.current?.focus()}>
                <span>➕ 发布帖子</span>
              </button>
            )}
          </div>
        )}
        {cards}
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {hasMore && !postsLoading && displayedPosts.length > 0 && (
          <div style={{ textAlign: "center", padding: 16, color: "var(--muted)", fontSize: 13 }}>加载更多...</div>
        )}
      </div>
    </>
  );
}
