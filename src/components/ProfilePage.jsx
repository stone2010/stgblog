import React, { useState, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { Icons } from "./Icons";
import PostCard from "./PostCard";

export default function ProfilePage({ posts, onAuthOpen, onSelectPost, onLike, onShare, onRepost, onBookmark, onFollowersPage }) {
  const { user, followingSet, logout, updateBio } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [profileTab, setProfileTab] = useState("posts"); // posts | replies | likes

  const userPosts = useMemo(() => {
    if (!user) return [];
    if (profileTab === "likes") {
      const liked = new Set(JSON.parse(localStorage.getItem("likedPosts") || "[]"));
      return posts.filter((p) => liked.has(p.id));
    }
    return posts.filter((p) => p.author === user.username);
  }, [posts, user, profileTab]);

  const pinnedPost = useMemo(() => userPosts.find((p) => p.pinned), [userPosts]);

  const handleSaveBio = useCallback(async () => {
    await updateBio(editBio.trim());
    setEditOpen(false);
  }, [editBio, updateBio]);

  if (!user) return (
    <div className="empty-state" style={{ paddingTop: 80 }}>
      <div className="icon">👤</div>
      <h3>未登录</h3>
      <p>登录后查看个人主页</p>
      <button className="compose-submit" style={{ marginTop: 16 }} onClick={onAuthOpen}>登录</button>
    </div>
  );

  return (
    <>
      <div className="profile-header">
        <div className="profile-banner" />
        <div className="profile-info">
          <div className="profile-avatar">{user.username[0]}</div>
          <div className="profile-name">{user.username} <Icons.Verified /></div>
          <div className="profile-handle">@{user.username}</div>
          <div className="profile-bio">{user.bio || "STGBLOG 用户 · 加密社交"}</div>
          <div className="profile-stats">
            <span style={{ cursor: "pointer" }} onClick={() => onFollowersPage?.("following")}><b>{followingSet.size}</b> 关注</span>
            <span style={{ cursor: "pointer" }} onClick={() => onFollowersPage?.("followers")}><b>{posts.filter((p) => p.author === user.username).length}</b> 帖子</span>
          </div>
          <div className="profile-actions">
            <button className="profile-edit" onClick={() => { setEditBio(user.bio || ""); setEditOpen(true); }}>编辑资料</button>
            <button className="profile-edit" onClick={logout} style={{ color: "var(--red)", borderColor: "rgba(244,33,46,0.3)" }}>退出</button>
          </div>
        </div>
      </div>
      <div className="profile-tabs">
        <button className={`profile-tab ${profileTab === "posts" ? "on" : ""}`} onClick={() => setProfileTab("posts")}>帖子</button>
        <button className={`profile-tab ${profileTab === "likes" ? "on" : ""}`} onClick={() => setProfileTab("likes")}>喜欢</button>
      </div>
      <div className="feed">
        {pinnedPost && profileTab === "posts" && (
          <PostCard key={`pinned-${pinnedPost.id}`} post={pinnedPost} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} />
        )}
        {userPosts.length === 0 ? (
          <div className="empty-state"><div className="icon">📝</div><h3>暂无帖子</h3><p>发布你的第一条动态</p></div>
        ) : userPosts.filter((p) => !p.pinned || profileTab !== "posts").map((post) => (
          <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} onRepost={onRepost} onBookmark={onBookmark} />
        ))}
      </div>

      {editOpen && (
        <div className="auth-overlay" onClick={() => setEditOpen(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="auth-top">
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>编辑资料</h3>
              <button className="auth-close" onClick={() => setEditOpen(false)}>✕</button>
            </div>
            <div className="auth-body" style={{ paddingTop: 16 }}>
              <label style={{ fontSize: 13, color: "var(--dim)", marginBottom: 6, display: "block" }}>个人简介</label>
              <textarea className="auth-input" value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="介绍一下自己..." rows={3} style={{ resize: "vertical", minHeight: 80 }} maxLength={200} />
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right", marginBottom: 12 }}>{editBio.length}/200</div>
              <button className="auth-btn" onClick={handleSaveBio}>保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
