import React from "react";

/* 三模块一级入口导航（主页/提问/博客）
   配色主题切换已移至 设置→外观→配色主题(2026-11-06 用户反馈) */
const ITEMS = [
  { key: "home", label: "主页" },
  { key: "questions", label: "提问" },
  { key: "blog", label: "博客" },
];

export default function SectionNav({ page, onNavigate }) {
  return (
    <div className="secnav" role="navigation" aria-label="内容导航">
      <div className="secnav-inner">
        <div className="secnav-tabs">
          {ITEMS.map((it) => (
            <button
              key={it.key}
              className={`secnav-btn ${page === it.key ? "on" : ""}`}
              aria-current={page === it.key ? "page" : undefined}
              onClick={() => onNavigate(it.key)}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
