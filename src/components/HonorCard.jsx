import React from "react";
import { levelProgress, LEVELS } from "../honors";
import { HonorBadge } from "./HonorBadge";

// 荣誉名片：只展示公开档案（等级 / XP / 声望 / 汇总数）+ 本人精选徽章
// 不含最后活跃日期、积分流水等隐私字段。
export default function HonorCard({ growth, badges = [], onOpen, compact = false, isMe = false }) {
  if (!growth) return null;
  const xp = Number(growth.total_xp || 0);
  const prog = levelProgress(xp);
  const cur = prog.cur;
  const stage = LEVELS[Math.max(0, Math.min(9, Number(growth.level || 1) - 1))];

  return (
    <section className={`honor-card tone-${cur.tone}${compact ? " honor-card-compact" : ""}`}>
      <div className="honor-card-head">
        <div className="honor-card-emblem" aria-hidden="true">
          <span className="honor-card-emblem-lv">{Number(growth.level) || 1}</span>
          <span className="honor-card-emblem-cap">LEVEL</span>
        </div>
        <div className="honor-card-id">
          <div className="honor-card-kicker">STG HONORS · {stage.stage}</div>
          <div className="honor-card-title">
            <span className="honor-card-name">{cur.title}</span>
            <span className="honor-card-stage">Lv.{Number(growth.level) || 1}</span>
          </div>
          <div className="honor-card-sub">
            累计 <b>{xp.toLocaleString()}</b> XP · 声望 <b>{Number(growth.reputation || 0).toLocaleString()}</b>
          </div>
        </div>
        {onOpen && (
          <button className="honor-card-link" onClick={onOpen} title="打开荣誉中心">荣誉中心 ›</button>
        )}
      </div>

      <div className="honor-progress">
        <div className="honor-progress-meta">
          <span>{prog.isMax ? "已达最高等级" : `距 ${prog.next.title} 还差 ${prog.toNext.toLocaleString()} XP`}</span>
          <span>{prog.isMax ? "MAX" : `${prog.pct}%`}</span>
        </div>
        <div className="honor-progress-track">
          <div className="honor-progress-fill" style={{ width: `${prog.pct}%` }} />
        </div>
        <div className="honor-progress-scale">
          <span>{cur.xp.toLocaleString()} XP</span>
          <span>{prog.isMax ? "3,200 XP" : `${prog.next.xp.toLocaleString()} XP`}</span>
        </div>
      </div>

      <div className="honor-card-stats">
        <span><b>{Number(growth.active_days || 0)}</b> 活跃天</span>
        <span><b>{Number(growth.post_count || 0)}</b> 主题</span>
        <span><b>{Number(growth.reply_count || 0)}</b> 回复</span>
      </div>

      {badges.length > 0 && (
        <div className="honor-card-badges">
          {badges.map((c) => <HonorBadge key={c} code={c} size="sm" />)}
        </div>
      )}
      {isMe && badges.length === 0 && (
        <div className="honor-card-tip">在荣誉中心可以挑选最多 3 枚徽章展示在主页与帖子中</div>
      )}
    </section>
  );
}
