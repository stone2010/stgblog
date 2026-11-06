import React from "react";
import { useAuth } from "../context/AuthContext";

/* 三模块一级入口导航（主页/提问/博客）+ 全站配色主题切换
   设计基准:stgblog-three-sections-mobile-demo.html 顶部导航 */
const ITEMS = [
  { key: "home", label: "主页" },
  { key: "questions", label: "提问" },
  { key: "blog", label: "博客" },
];

export default function SectionNav({ page, onNavigate }) {
  const { paletteMode, setPaletteMode, colorMode, setColorMode, accentColor, setAccentColor } = useAuth();

  const pickPalette = (p) => {
    if (p === paletteMode) return;
    setPaletteMode(p);
    // 两套配色均为亮色设计:若当前处于深色模式,自动切回亮色以立即呈现效果
    if (colorMode !== "light") setColorMode("light");
    // 配色主题自带强调色,清除用户自选强调色的内联覆盖,避免两套系统打架
    if (accentColor !== "green") setAccentColor("green");
  };

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
        <div className="palette-seg" role="group" aria-label="配色主题">
          <button
            className={`palette-btn ${paletteMode === "vintage" ? "on" : ""}`}
            title="复古暖调:旧纸张与印刷编辑部风格"
            onClick={() => pickPalette("vintage")}
          >
            <span className="palette-dot vintage" /><span className="pl-full">复古暖调</span><span className="pl-short">复古</span>
          </button>
          <button
            className={`palette-btn ${paletteMode === "modern" ? "on" : ""}`}
            title="现代蓝绿:清爽理性的现代数字风格"
            onClick={() => pickPalette("modern")}
          >
            <span className="palette-dot modern" /><span className="pl-full">现代蓝绿</span><span className="pl-short">现代</span>
          </button>
        </div>
      </div>
    </div>
  );
}
