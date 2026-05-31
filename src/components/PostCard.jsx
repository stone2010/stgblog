import React, { memo, useCallback } from "react";
import { Icons } from "./Icons";
import { hasLiked, formatTime, formatCount } from "../utils";
import { useAuth } from "../context/AuthContext";

const PostCard = memo(function PostCard({ post, onSelect, onLike, onShare }) {
  const { user, followingSet, follow } = useAuth();

  const handleAuthorClick = useCallback((e) => {
    e.stopPropagation();
    onSelect(post, "profile");
  }, [post, onSelect]);

  const handleLikeClick = useCallback((e) => {
    e.stopPropagation();
    onLike(post);
  }, [post, onLike]);

  const handleShareClick = useCallback((e) => {
    e.stopPropagation();
    onShare(post);
  }, [post, onShare]);

  const handleFollowClick = useCallback((e) => {
    e.stopPropagation();
    follow(post.author);
  }, [post.author, follow]);

  const liked = hasLiked(post.id);

  return (
    <article className="post" onClick={() => onSelect(post)}>
      <div className="post-avatar" style={{ cursor: "pointer" }} onClick={handleAuthorClick}>{post.author[0]}</div>
      <div className="post-body">
        <div className="post-head">
          <span className="post-author" onClick={handleAuthorClick} style={{ cursor: "pointer" }}>{post.author}</span>
          <span className="post-handle">@{post.author}</span>
          <span className="post-dot">·</span>
          <span className="post-time">{formatTime(post.created_at)}</span>
          {post.pinned && <span style={{ marginLeft: 4, fontSize: 12 }}>📌</span>}
          {user && post.author !== user.username && !followingSet.has(post.author) && (
            <button className="follow-inline-btn" onClick={handleFollowClick}>+ 关注</button>
          )}
        </div>
        <div className="post-content">{post.content}</div>
        <div className="post-actions">
          <button className="post-action" onClick={(e) => { e.stopPropagation(); onSelect(post); }}>
            <span className="pa-icon">💬</span>
            <span>{formatCount(post.views || 0)}</span>
          </button>
          <button className="post-action retweet" onClick={handleShareClick}>
            <span className="pa-icon"><Icons.RT /></span>
          </button>
          <button className={`post-action ${liked ? "liked" : ""}`} onClick={handleLikeClick}>
            <span className="pa-icon">{liked ? <Icons.HeartFill /> : <Icons.Heart />}</span>
            <span>{formatCount(post.likes || 0)}</span>
          </button>
          <button className="post-action" onClick={handleShareClick}>
            <span className="pa-icon"><Icons.Share /></span>
          </button>
        </div>
      </div>
    </article>
  );
});

export default PostCard;
