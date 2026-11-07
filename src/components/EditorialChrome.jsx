import React from "react";
import { HERO_COPY } from "../heroCopy";
import { pickManifesto } from "../manifestoCopy";

/* 编辑部印刷风专属版块 —— 仅在 设置→界面风格=编辑部 时渲染
   视觉基准:stgblog-editorial-reference-v2.html */

// 经典版「每次刷新随机一条」的取词器：池子 1000 条，并避开上一次，避免连刷重复
let _lastCopy = -1;
export function pickCopy() {
  const n = HERO_COPY.length;
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === _lastCopy) i = (i + 1) % n;
  _lastCopy = i;
  return HERO_COPY[i] || HERO_COPY[0];
}

export function EditorialTopStrip() {
  return (
    <div className="ed-strip">
      <span className="ed-micro">Independent publication <b>✳</b> Ideas / Notes / Experiments</span>
      <span className="ed-micro">Vol. 01 &nbsp;—&nbsp; 2026</span>
    </div>
  );
}

export function EditorialHero() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
  const weekStr = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][now.getDay()];
  const [copy] = React.useState(pickCopy); // 每次挂载随机取一条,刷新即换
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
          <p>{copy}</p>
        </div>
      </div>
      <div className="ed-hero-right">
        <div className="ed-issue-line ed-micro"><span>Selected thoughts</span><span>{dateStr}</span></div>
        <div className="ed-cover-art">
          <span className="ed-ring" />
          <span className="ed-ring two" />
          <span className="ed-cross" />
          <span className="ed-cover-big">{dateStr}</span>
          <span className="ed-cover-caption ed-micro">A PLACE FOR IDEAS — {weekStr}</span>
        </div>
        <div className="ed-issue-line bottom ed-micro"><span>Scroll to explore</span><span>↓</span></div>
      </div>
    </section>
  );
}

/* 编辑部版「主页栏目文案区」——把经典版页首那套文案(SHORT POSTS / 主页 /
   简短记录副标题 + 随机一句)移植进编辑部版,用报头式衬线排版呈现。
   与底部宣言、About、Footer 共用 01/02/03 编号体系。 */
export function EditorialPageIntro({ tagline }) {
  return (
    <section className="ed-pageintro">
      <div className="ed-pageintro-head">
        <div className="ed-label ed-micro">01 / Short posts — 主页</div>
        <h2 className="ed-pageintro-title">简短记录、<em>随手想法</em>与日常更新。</h2>
      </div>
      <div className="ed-pageintro-side">
        <span className="ed-micro">Selected notes</span>
        <p className="ed-pageintro-tagline" title="每次刷新都会换一条">{tagline}</p>
      </div>
    </section>
  );
}

export function EditorialInterlude() {
  // 每次挂载随机取一条宣言(避开上一次),lead 正常色 + punch 红色斜体强调
  const [m] = React.useState(pickManifesto);
  return (
    <section className="ed-interlude">
      <div className="ed-interlude-inner">
        <div>
          <div className="ed-label ed-micro">02 / A small manifesto</div>
          <div className="ed-micro ed-interlude-sub">Why this space exists</div>
        </div>
        <blockquote className="ed-quote">
          “{m.lead}<em>{m.punch}</em>”
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
