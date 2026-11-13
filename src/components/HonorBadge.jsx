import React from "react";
import { ACHIEVEMENT_MAP, RARITY, LEVELS } from "../honors";

// 紧凑身份标识：只在「荣誉体系已开启且服务端已就绪」时由调用方渲染
export function LevelChip({ level = 1, compact = false }) {
  const n = Math.max(1, Math.min(10, Number(level) || 1));
  const meta = LEVELS[n - 1];
  return (
    <span className={`honor-lvl tone-${meta.tone}${compact ? " compact" : ""}`}
      title={`STG 荣誉体系 · Lv.${n} ${meta.title}（${meta.stage}）`}>
      <b>Lv.{n}</b><span>{meta.title}</span>
    </span>
  );
}

export function HonorBadge({ code, size = "sm", locked = false, title }) {
  const a = ACHIEVEMENT_MAP[code];
  if (!a) return null;
  return (
    <span className={`honor-badge honor-badge-${size} rarity-${a.rarity}${locked ? " is-locked" : ""}`}
      title={title || `${a.name} · ${RARITY[a.rarity].label} · ${a.desc}`}>
      <span className="honor-badge-glyph">{a.glyph}</span>
      {size !== "xs" && <span className="honor-badge-name">{a.name}</span>}
    </span>
  );
}
