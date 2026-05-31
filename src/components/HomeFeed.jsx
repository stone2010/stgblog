import React, { useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { getHotPosts, getRecommendPosts, getLikedSet } from "../utils";
import PostCard from "./PostCard";
import ComposeBar from "./ComposeBar";

export default function HomeFeed({
  posts, postsLoading, tab, setTab, searchKey,
  composeText, setComposeText, onPublish,
  onSelectPost, onLike, onShare,
}) {
  const { user, followingSet } = useAuth();

  const displayedPosts = useMemo(() => {
    const kw = searchKey.trim().toLowerCase();
    let f = posts.filter((p) => !kw || [p.title, p.content, p.author, p.category].join(" ").toLowerCase().includes(kw));
    if (tab === "我的") { if (!user) return []; f = f.filter((p) => p.author === user.username); }
    if (tab === "关注") {
      if (!user) return [];
      f = f.filter((p) => followingSet.has(p.author) || p.author === user.username);
      return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (tab === "热门") return getHotPosts(f);
    if (tab === "推荐") return getRecommendPosts(f, { followingSet, likedPosts: getLikedSet() });
    return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, searchKey, tab, user, followingSet]);

  return (
    <>
      <div className="feed-header">
        <div className="feed-tabs">
          {["最新", "热门", "推荐", "关注", "我的"].map((t) => (
            <button key={t} className={`feed-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="feed">
        <ComposeBar value={composeText} onChange={setComposeText} onPublish={onPublish} />
        {postsLoading && <div className="loader" />}
        {!postsLoading && displayedPosts.length === 0 && (
          <div className="empty-state">
            <div className="icon">📝</div>
            <h3>暂无内容</h3>
            <p>{tab === "关注" ? "关注一些用户后，他们的帖子会出现在这里" : user ? "成为第一个发帖的人" : "登录后发帖互动"}</p>
          </div>
        )}
        {displayedPosts.map((post) => (
          <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} />
        ))}
      </div>
    </>
  );
}
