import React from "react";

// STG HONORS · 徽章图形
// 参考《STGBLOG Achievements》UI 设计稿：稀有度决定外框形状与配色，
// 成就主题决定内部图标。全部为内联 SVG，无外部字体 / 图片依赖；
// 颜色通过 CSS 变量注入（见 style-honors.css），可适配站点三套主题。
// 这里不做任何计分或状态判定，只负责把一条成就元数据画出来。

const HEX = "M50 3L91 26.5v47L50 97 9 73.5v-47z";
const SHD = "M50 3L88 17v32c0 25-17 40-38 48C29 89 12 74 12 49V17z";
const STAR = Array.from({ length: 24 }, (_, k) => {
  const a = k * Math.PI / 12 - Math.PI / 2;
  const r = k % 2 ? 42 : 48;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");

const sc = (k) => `translate(50 50) scale(${k}) translate(-50 -50)`;

function Frame({ rarity }) {
  if (rarity === "common") {
    return <>
      <circle className="he-a2" cx="50" cy="50" r="47" />
      <circle className="he-a1" cx="50" cy="50" r="40" />
      <circle className="he-ah" cx="50" cy="50" r="35" />
    </>;
  }
  if (rarity === "legend") {
    return <>
      <polygon className="he-a2" points={STAR} />
      <circle className="he-a1" cx="50" cy="50" r="38" />
      <circle className="he-ah" cx="50" cy="50" r="33" />
    </>;
  }
  const p = rarity === "rare" ? HEX : SHD;
  return <>
    <path className="he-a2" d={p} />
    <path className="he-a1" d={p} transform={sc(0.86)} />
    <path className="he-ah" d={p} transform={sc(0.76)} />
  </>;
}

// 图标形状：he-f 白色主体 / he-k 内框色细节 / he-s 白色描边 / he-ks 内框色描边
const SHAPES = {
  message: <>
    <rect className="he-f" x="24" y="30" width="52" height="38" rx="9" />
    <path className="he-f" d="M38 65v11l13-10z" />
    <path className="he-line" d="M35 45h30M35 55h21" />
  </>,
  layers: <>
    <path className="he-f" d="M50 27l23 12-23 12-23-12z" />
    <path className="he-s" d="M27 52l23 12 23-12" />
    <path className="he-s" d="M27 63l23 12 23-12" />
  </>,
  book: <>
    <path className="he-f" d="M26 30h20c3 0 4 2 4 5v38c0-3-1-5-4-5H26z" />
    <path className="he-f" d="M74 30H54c-3 0-4 2-4 5v38c0-3 1-5 4-5h20z" />
    <path className="he-line" d="M31 41h13M31 50h13M56 41h13M56 50h13" />
  </>,
  pen: <>
    <g transform="rotate(45 50 50)">
      <rect className="he-f" x="44" y="24" width="12" height="38" rx="2" />
      <path className="he-f" d="M44 65h12l-6 11z" />
    </g>
    <path className="he-s" d="M29 74h14" />
  </>,
  spark: <>
    <path className="he-f" d="M50 22l7 21 21 7-21 7-7 21-7-21-21-7 21-7z" />
    <circle className="he-f" cx="73" cy="30" r="3" />
    <circle className="he-f" cx="29" cy="69" r="2.5" />
  </>,
  chat: <>
    <rect className="he-f" opacity="0.55" x="42" y="44" width="30" height="22" rx="7" />
    <rect className="he-f" x="26" y="30" width="34" height="24" rx="7" />
    <path className="he-f" d="M34 52v10l10-8z" />
  </>,
  sun: <>
    <circle className="he-f" cx="50" cy="50" r="14" />
    <path className="he-s" d="M50 22v8M50 70v8M22 50h8M70 50h8M30 30l6 6M64 64l6 6M70 30l-6 6M36 64l-6 6" />
  </>,
  cal: <>
    <rect className="he-f" x="28" y="33" width="44" height="40" rx="7" />
    <path className="he-s" d="M39 27v11M61 27v11" />
    <path className="he-ks he-thin" d="M28 47h44" />
    <rect className="he-k" x="37" y="54" width="7" height="6" rx="1.5" />
    <rect className="he-k" x="47" y="54" width="7" height="6" rx="1.5" />
    <rect className="he-k" x="57" y="54" width="7" height="6" rx="1.5" />
    <rect className="he-k" x="37" y="63" width="7" height="6" rx="1.5" />
  </>,
  footprint: <>
    <ellipse className="he-f" cx="42" cy="42" rx="9" ry="13" />
    <ellipse className="he-f" cx="60" cy="64" rx="9" ry="12" />
    <circle className="he-f" cx="33" cy="23" r="3" />
    <circle className="he-f" cx="42" cy="20" r="3" />
    <circle className="he-f" cx="50" cy="24" r="3" />
  </>,
  compass: <>
    <circle className="he-f" cx="50" cy="50" r="26" />
    <path className="he-k" d="M60 40l-7 18-13 5 7-18z" />
  </>,
  hourglass: <>
    <path className="he-s" d="M34 28h32M34 72h32M38 28c0 12 12 14 12 22s-12 10-12 22M62 28c0 12-12 14-12 22s12 10 12 22" />
  </>,
  eye: <>
    <path className="he-s" d="M24 50c8-13 18-19 26-19s18 6 26 19c-8 13-18 19-26 19s-18-6-26-19z" />
    <circle className="he-k" cx="50" cy="50" r="8" />
  </>,
  map: <>
    <path className="he-f" d="M27 32l16-6 14 6 16-6v42l-16 6-14-6-16 6z" />
    <path className="he-line" d="M43 26v42M57 32v42" />
  </>,
  globe: <>
    <circle className="he-f" cx="50" cy="50" r="26" />
    <path className="he-line" d="M24 50h52M50 24c9 8 9 44 0 52M50 24c-9 8-9 44 0 52" />
  </>,
  archive: <>
    <rect className="he-f" x="26" y="32" width="48" height="14" rx="3" />
    <path className="he-f" d="M30 48h40v25a4 4 0 0 1-4 4H34a4 4 0 0 1-4-4z" />
    <rect className="he-k" x="44" y="56" width="12" height="4" rx="2" />
  </>,
  search: <>
    <circle className="he-s" cx="46" cy="46" r="17" />
    <path className="he-s" d="M58 58l14 14" />
  </>,
  flag: <>
    <path className="he-s" d="M32 25v50" />
    <path className="he-f" d="M34 27h34l-8 12 8 12H34z" />
  </>,
  moon: <>
    <path className="he-f" d="M62 66a21 21 0 1 1-17-37 17 17 0 0 0 17 37z" />
    <circle className="he-f" cx="66" cy="36" r="3" />
    <circle className="he-f" cx="73" cy="47" r="2" />
  </>,
  clock: <>
    <circle className="he-f" cx="50" cy="50" r="26" />
    <path className="he-line" d="M50 34v17l11 7" />
  </>,
  flame: <>
    <path className="he-f" d="M50 24c2 10 14 14 14 29a14 14 0 0 1-28 0c0-7 3-11 7-15 0 5 2 8 5 8 0-8-1-14 2-22z" />
    <path className="he-k" d="M50 74a7 7 0 0 1-7-7c0-4 3-6 5-9 1 3 3 4 5 4 2 2 4 6 4 10a7 7 0 0 1-7 2z" />
  </>,
  heart: <>
    <path className="he-f" d="M50 74S27 60 27 43a12.5 12.5 0 0 1 23-6.5A12.5 12.5 0 0 1 73 43c0 17-23 31-23 31z" />
  </>,
  users: <>
    <circle className="he-f" opacity="0.55" cx="62" cy="40" r="7" />
    <path className="he-f" opacity="0.55" d="M52 70c0-9 4-15 10-15s11 6 11 15z" />
    <circle className="he-f" cx="41" cy="40" r="9" />
    <path className="he-f" d="M24 72c0-11 7-18 17-18s17 7 17 18z" />
  </>,
  shield: <>
    <path className="he-f" d="M50 25l21 8v15c0 14-9 23-21 28-12-5-21-14-21-28V33z" />
    <path className="he-ks" d="M40 49l7 7 13-14" />
  </>,
  cross: <>
    <path className="he-f" d="M43 26h14v17h17v14H57v17H43V57H26V43h17z" />
  </>,
  bookmark: <>
    <path className="he-f" d="M34 26h32v48l-16-12-16 12z" />
  </>,
  ticket: <>
    <rect className="he-f" x="24" y="36" width="52" height="28" rx="6" />
    <path className="he-line" d="M42 36v28" />
  </>,
  star: <>
    <path className="he-f" d="M50 24l8 17 19 2-14 13 4 19-17-9-17 9 4-19-14-13 19-2z" />
  </>,
  gem: <>
    <path className="he-f" d="M36 30h28l12 16-26 28-26-28z" />
    <path className="he-line" d="M36 30l14 44 14-44M24 46h52" />
  </>,
  crown: <>
    <path className="he-f" d="M26 68l-6-34 16 11 14-20 14 20 16-11-6 34z" />
    <rect className="he-f" x="30" y="70" width="40" height="7" rx="2" />
  </>,
  echo: <>
    <circle className="he-f" cx="50" cy="50" r="7" />
    <circle className="he-s" cx="50" cy="50" r="16" />
    <circle className="he-s" opacity="0.5" cx="50" cy="50" r="26" />
  </>,
  lock: <>
    <path className="he-s" d="M39 48v-8a11 11 0 0 1 22 0v8" />
    <rect className="he-f" x="31" y="48" width="38" height="26" rx="7" />
    <circle className="he-k" cx="50" cy="59" r="4" />
    <rect className="he-k" x="48" y="60" width="4" height="8" rx="2" />
  </>,
  help: <>
    <path className="he-s" d="M39 41a11 11 0 1 1 15 10c-3 2-4 4-4 8" />
    <circle className="he-f" cx="50" cy="70" r="3.5" />
  </>,
};

// icon 取自 src/honors.js 的成就元数据，与 v12 SQL 的 achievements.icon 保持一致。
export default function HonorEmblem({ achievement, size = 60, locked = false, hidden = false, pop = false, className = "" }) {
  if (!achievement) return null;
  const shape = hidden ? "help" : achievement.icon;
  const icon = SHAPES[shape] || SHAPES.spark;
  return (
    <svg
      className={`honor-emblem rarity-${achievement.rarity}${locked ? " is-locked" : ""}${pop ? " pop" : ""} ${className}`}
      width={size} height={size} viewBox="0 0 100 100" role="img"
      aria-label={locked ? "未解锁徽章" : `${achievement.name} 徽章`}
    >
      <Frame rarity={achievement.rarity} />
      {icon}
    </svg>
  );
}
