import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { formatTimeShort, formatCount } from "../utils";
import { supabase } from "../supabase";

/* 提问页 —— 独立一级入口(知乎式问答)
   数据约定:posts.category === "提问"(title=content=问题文本),回答复用 comments 表 */

function isQuestion(p) { return p.category === "提问"; }

function QuestionCard({ post, index, answerCount, topAnswer, onSelect, onUserClick }) {
  return (
    <article className="q2-card" onClick={() => onSelect(post)}>
      <div className="q2-head">
        <span className="q2-badge">Q</span>
        <h2 className="q2-title">{post.title || post.content}</h2>
      </div>
      {post.content && post.title && post.content !== post.title && (
        <p className="q2-desc">{post.content.slice(0, 140)}{post.content.length > 140 ? "…" : ""}</p>
      )}
      {topAnswer && (
        <div className="answerpreview">
          <b>回答 · {topAnswer.author}</b>
          <br />
          {String(topAnswer.content || "").slice(0, 90)}{(topAnswer.content || "").length > 90 ? "…" : ""}
        </div>
      )}
      <div className="q2-foot">
        <div className="q2-meta">
          <span className="author" onClick={(e) => { e.stopPropagation(); onUserClick(post.author); }}>{post.author}</span>
          <i className="dot" />
          <span>{formatTimeShort(post.created_at)}</span>
          <span className="pill">提问</span>
        </div>
        <span className="q2-count">{formatCount(answerCount || 0)} 个回答</span>
      </div>
    </article>
  );
}

export default function QuestionsPage({ posts, postsLoading, onAsk, onSelectPost, onAuthOpen, onUserClick }) {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [info, setInfo] = useState({}); // postId -> {count, top}

  const questions = useMemo(
    () => posts.filter(isQuestion).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [posts]
  );

  // 批量拉取回答数 + 首条回答预览
  useEffect(() => {
    if (questions.length === 0) return;
    const ids = questions.map((p) => p.id);
    let alive = true;
    supabase.from("comments").select("post_id, author, content, created_at").in("post_id", ids).order("created_at", { ascending: true }).then(({ data }) => {
      if (!alive) return;
      const m = {};
      (data || []).forEach((r) => {
        const e = m[r.post_id] || { count: 0, top: null };
        e.count += 1;
        if (!e.top) e.top = r;
        m[r.post_id] = e;
      });
      setInfo(m);
    });
    return () => { alive = false; };
  }, [posts]);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    if (!user) { onAuthOpen?.(); return; }
    setAsking(true);
    await onAsk(q);
    setAsking(false);
    setQuestion("");
  };

  return (
    <div className="pageblock">
      <div className="pageintro">
        <div>
          <div className="eyebrow">QUESTIONS &amp; ANSWERS</div>
          <h1>提问</h1>
        </div>
        <p>提出具体问题，查看回答与讨论。</p>
      </div>
      <div className="ask-bar">
        <input
          className="ask-input"
          placeholder={user ? "提出你的问题，尽量描述背景与具体困惑…" : "登录后提问"}
          value={question}
          maxLength={100}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
        />
        <button className="ask-btn" disabled={asking || !question.trim()} onClick={handleAsk}>{asking ? "…" : "提问"}</button>
      </div>
      {postsLoading && <div className="loader" />}
      {!postsLoading && questions.length === 0 && (
        <div className="empty-state">
          <div className="icon">❓</div>
          <h3>还没有提问</h3>
          <p>提出第一个问题，等待大家回答</p>
        </div>
      )}
      <div className="q2-list">
        {questions.map((p, i) => (
          <QuestionCard
            key={p.id}
            post={p}
            index={i}
            answerCount={info[p.id]?.count}
            topAnswer={info[p.id]?.top}
            onSelect={onSelectPost}
            onUserClick={onUserClick}
          />
        ))}
      </div>
    </div>
  );
}
