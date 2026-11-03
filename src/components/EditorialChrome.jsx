import React from "react";

/* 编辑部印刷风专属版块 —— 仅在 设置→界面风格=编辑部 时渲染
   视觉基准:stgblog-editorial-reference-v2.html */

export function EditorialTopStrip() {
  return (
    <div className="ed-strip">
      <span className="ed-micro">Independent publication <b>✳</b> Ideas / Notes / Experiments</span>
      <span className="ed-micro">Vol. 01 &nbsp;—&nbsp; 2026</span>
    </div>
  );
}

export function EditorialHero() {
  return (
    <section className="ed-hero">
      <div className="ed-hero-left">
        <div className="ed-kicker ed-micro">A personal publication / Est. 2010</div>
        <h1 className="ed-title">
          THINK<br />
          <span className="ed-outline">MORE</span><br />
          <span className="ed-italic">deeply.</span>
        </h1>
        <div className="ed-hero-foot">
          <div className="ed-asterisk">✳</div>
          <p>一个持续更新的个人空间。记录想法，拆解问题，在阅读、创造与日常观察中建立自己的理解。</p>
        </div>
      </div>
      <div className="ed-hero-right">
        <div className="ed-issue-line ed-micro"><span>Selected thoughts</span><span>01—05</span></div>
        <div className="ed-cover-art">
          <span className="ed-ring" />
          <span className="ed-ring two" />
          <span className="ed-cross" />
          <span className="ed-cover-big">STG/01</span>
          <span className="ed-cover-caption ed-micro">A PLACE FOR IDEAS — 2026</span>
        </div>
        <div className="ed-issue-line bottom ed-micro"><span>Scroll to explore</span><span>↓</span></div>
      </div>
    </section>
  );
}

export function EditorialInterlude() {
  return (
    <section className="ed-interlude">
      <div className="ed-interlude-inner">
        <div>
          <div className="ed-label ed-micro">02 / A small manifesto</div>
          <div className="ed-micro ed-interlude-sub">Why this space exists</div>
        </div>
        <blockquote className="ed-quote">
          “写作不是为了显得无所不知，而是为了更诚实地看见：<em>我正在如何理解这个世界。</em>”
        </blockquote>
      </div>
    </section>
  );
}

export function EditorialAbout() {
  return (
    <section className="ed-about-row">
      <h2 className="ed-micro">03 / About this space</h2>
      <p>这里不追求快速得出结论。它更像一本不断增补的私人刊物：把正在思考的事放在桌面上，允许它们被阅读、被质疑，也允许它们继续变化。</p>
    </section>
  );
}

export function EditorialFooter() {
  return (
    <footer className="ed-footer">
      <span className="ed-footer-logo">STG<i>.</i></span>
      <span className="ed-micro">Made for curious minds</span>
      <span className="ed-micro">© 2026 — Personal archive</span>
    </footer>
  );
}
