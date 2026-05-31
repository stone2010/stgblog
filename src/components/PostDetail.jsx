import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import { Icons } from "./Icons";
import CommentNode from "./CommentNode";
import { hasLiked, formatTime, formatCount, buildTree } from "../utils";

export default function PostDetail({ post, onClose, onLike, onShare, onUserClick, onDeletePost }) {
  const { user, followingSet, follow, unfollow } = useAuth();
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  useEffect(() => {
    if (!post) return;
    (async () => {
      const { data } = await supabase.from("comments").select("*").eq("post_id", post.id).order("created_at", { ascending: true });
      if (data) setComments(data);
    })();
  }, [post]);

  const commentTree = useMemo(() => buildTree(comments), [comments]);

  const handleComment = useCallback(async () => {
    if (!user || !post) return;
    const text = commentText.trim();
    if (!text || text.length > 500) return;
    setCommentLoading(true);
    const { data, error } = await supabase.from("comments").insert([{
      post_id: post.id, author: user.username, content: text, parent_id: null,
    }]).select("*").single();
    if (!error) {
      setComments((prev) => [...prev, data]);
      setCommentText("");
      if (post.author !== user.username) {
        await supabase.from("notifications").insert([{
          user_to: post.author, user_from: user.username,
          type: "comment", post_id: post.id, comment_id: data.id,
        }]);
      }
    }
    setCommentLoading(false);
  }, [user, post, commentText]);

  const handleReply = useCallback(async (parentId) => {
    if (!user || !post) return;
    const text = replyText.trim();
    if (!text || text.length > 500) return;
    setReplySubmitting(true);
    const { data, error } = await supabase.from("comments").insert([{
      post_id: post.id, author: user.username, content: text, parent_id: parentId,
    }]).select("*").single();
    if (!error) {
      setComments((prev) => [...prev, data]);
      setReplyText(""); setReplyTarget(null);
      const parentComment = comments.find((c) => c.id === parentId);
      if (parentComment && parentComment.author !== user.username) {
        await supabase.from("notifications").insert([{
          user_to: parentComment.author, user_from: user.username,
          type: "reply", post_id: post.id, comment_id: data.id,
        }]);
      }
    }
    setReplySubmitting(false);
  }, [user, post, replyText, comments]);

  const handleDeleteComment = useCallback(async (comment) => {
    if (!user || comment.author !== user.username) return;
    await supabase.from("comments").delete().eq("id", comment.id);
    const toDelete = new Set();
    const collect = (id) => { toDelete.add(id); comments.filter((c) => c.parent_id === id).forEach((c) => collect(c.id)); };
    collect(comment.id);
    setComments((prev) => prev.filter((c) => !toDelete.has(c.id)));
  }, [user, comments]);

  if (!post) return null;
  const liked = hasLiked(post.id);

  return (
    <div className="detail">
      <div className="detail-top">
        <button className="detail-back" onClick={onClose}><Icons.Back /></button>
        <span className="detail-top-title">帖子</span>
      </div>
      <div className="detail-author">
        <div className="detail-avatar" style={{ cursor: "pointer" }} onClick={() => onUserClick(post.author)}>{post.author[0]}</div>
        <div>
          <div className="detail-name" style={{ cursor: "pointer" }} onClick={() => onUserClick(post.author)}>{post.author}</div>
          <div className="detail-handle">@{post.author}</div>
        </div>
        {user && post.author !== user.username && (
          followingSet.has(post.author) ? (
            <button className="follow-btn following" onClick={() => unfollow(post.author)}>已关注</button>
          ) : (
            <button className="follow-btn" onClick={() => follow(post.author)}>关注</button>
          )
        )}
      </div>
      <div className="detail-body">{post.content}</div>
      <div className="detail-time-bar">
        <span>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "short" }).format(new Date(post.created_at))}</span>
      </div>
      <div className="detail-stats">
        <span><b>{formatCount(post.views || 0)}</b> 浏览</span>
        <span><b>{formatCount(post.likes || 0)}</b> 赞</span>
        <span><b>{comments.length}</b> 评论</span>
      </div>
      <div className="detail-actions">
        <button className="detail-action">💬</button>
        <button className="detail-action retweet"><Icons.RT /></button>
        <button className={`detail-action ${liked ? "liked" : ""}`} onClick={() => onLike(post)}>
          {liked ? <Icons.HeartFill /> : <Icons.Heart />}
        </button>
        <button className="detail-action" onClick={() => onShare(post)}><Icons.Share /></button>
        {user && post.author === user.username && (
          <button className="detail-action" style={{ color: "var(--red)" }} onClick={() => onDeletePost(post)}>🗑</button>
        )}
      </div>
      <div className="cmt-section">
        {user && (
          <div className="cmt-input-area">
            <div className="comment-avatar">{user.username[0]}</div>
            <textarea className="cmt-textarea" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="发表评论..." rows={1} />
            <button className="cmt-send" onClick={handleComment} disabled={commentLoading || !commentText.trim()}>
              {commentLoading ? "..." : "回复"}
            </button>
          </div>
        )}
        {commentTree.map((node) => (
          <CommentNode key={node.id} node={node} user={user} onDelete={handleDeleteComment}
            replyTarget={replyTarget} setReplyTarget={setReplyTarget}
            replyText={replyText} setReplyText={setReplyText}
            submitting={replySubmitting} onSubmitReply={handleReply} onUserClick={onUserClick} />
        ))}
        {!user && <p style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 13 }}>登录后评论</p>}
      </div>
    </div>
  );
}
