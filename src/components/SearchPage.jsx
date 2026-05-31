import React, { useMemo } from "react";
import { Icons } from "./Icons";
import PostCard from "./PostCard";

export default function SearchPage({ searchKey, setSearchKey, posts, onSelectPost, onLike, onShare }) {
  const results = useMemo(() => {
    if (!searchKey.trim()) return [];
    const kw = searchKey.trim().toLowerCase();
    return posts.filter((p) => [p.title, p.content, p.author, p.category].join(" ").toLowerCase().includes(kw));
  }, [posts, searchKey]);

  return (
    <>
      <div className="search-bar">
        <span className="search-icon"><Icons.Search /></span>
        <input type="text" placeholder="搜索用户或帖子..." value={searchKey} onChange={(e) => setSearchKey(e.target.value)} autoFocus />
      </div>
      <div className="feed">
        {searchKey.trim() && results.length === 0 && (
          <div className="empty-state"><div className="icon">🔍</div><h3>无结果</h3><p>换个关键词试试</p></div>
        )}
        {searchKey.trim() ? results.map((post) => (
          <PostCard key={post.id} post={post} onSelect={onSelectPost} onLike={onLike} onShare={onShare} />
        )) : (
          <div className="empty-state"><div className="icon">🔍</div><h3>搜索</h3><p>搜索帖子、用户或话题</p></div>
        )}
      </div>
    </>
  );
}
