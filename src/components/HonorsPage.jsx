import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useHonors } from "../context/HonorsContext";
import { Icons } from "./Icons";
import HonorCard from "./HonorCard";
import { LevelChip } from "./HonorBadge";
import {
  ACHIEVEMENTS, CATEGORIES, RARITY, AVAILABLE_COUNT,
  XP_EVENT_LABELS, levelProgress,
} from "../honors";

function fmtTime(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function HonorsPage({ onBack }) {
  const { user } = useAuth();
  const {
    enabled, ready, loading, myGrowth, profiles, refresh,
    unlocked, unlockedCodes, featuredCodes, xpLog, setFeatured, badgesOf,
  } = useHonors();
  const [tab, setTab] = useState("badges");
  const [featErr, setFeatErr] = useState("");

  useEffect(() => { if (enabled && ready) refresh(); }, [enabled, ready, refresh]);

  const board = useMemo(() => Object.values(profiles)
    .filter((p) => p.honors_enabled)
    .sort((a, b) => Number(b.total_xp || 0) - Number(a.total_xp || 0))
    .slice(0, 10), [profiles]);

  const badgeRows = useMemo(() => CATEGORIES.map((c) => ({
    ...c,
    items: ACHIEVEMENTS.filter((a) => a.category === c.key),
  })).filter((c) => c.items.length), []);

  const unlockedCount = unlocked.length;

  const toggleFeatured = async (a) => {
    setFeatErr("");
    const on = featuredCodes.has(a.code);
    if (!on && featuredCodes.size >= 3) {
      setFeatErr("最多只能展示 3 枚精选徽章，请先取消一枚");
      return;
    }
    const err = await setFeatured(a.code, !on);
    if (err) setFeatErr(/3 枚|最多/.test(err) ? "最多只能展示 3 枚精选徽章，请先取消一枚" : err);
  };

  return (
    <div className="honors-page">
      <div className="detail-top">
        <button className="detail-back" onClick={onBack}><Icons.Back /></button>
        <span className="detail-top-title">STG 荣誉体系</span>
        <span className="honors-top-tag">STG HONORS</span>
      </div>

      {!enabled ? (
        <div className="honors-empty">
          <div className="honors-empty-icon">✦</div>
          <h3>荣誉体系尚未开启</h3>
          <p>这是可选功能，默认关闭。你可以在「设置 → 功能」中开启。</p>
          <button className="compose-submit" onClick={onBack}>返回</button>
        </div>
      ) : ready === false ? (
        <div className="honors-empty">
          <div className="honors-empty-icon">🗄</div>
          <h3>服务端功能尚未启用</h3>
          <p>站点管理员需要在 Supabase SQL Editor 执行一次 <code>migrations/v12_honors.sql</code>。</p>
          <p className="honors-empty-sub">在此之前网站其余功能完全不受影响，也不会产生任何成长数据。</p>
          <button className="compose-submit" onClick={onBack}>返回</button>
        </div>
      ) : (
        <>
          {!user && (
            <div className="honors-notice">当前为访客浏览，登录后才会开始记录你的成长值。</div>
          )}
          {myGrowth ? (
            <HonorCard growth={myGrowth} badges={badgesOf(user?.username)} isMe />
          ) : (
            <div className="honors-notice">
              {loading ? "正在同步荣誉数据…" : "尚无成长档案：登录并发布一条内容后即可开始累计。"}
            </div>
          )}

          <div className="honors-tabs" role="tablist">
            <button className={`honors-tab ${tab === "badges" ? "on" : ""}`} onClick={() => setTab("badges")}>
              成就图鉴 <span className="honors-tab-num">{unlockedCount}/{AVAILABLE_COUNT}</span>
            </button>
            <button className={`honors-tab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>成长记录</button>
            <button className={`honors-tab ${tab === "board" ? "on" : ""}`} onClick={() => setTab("board")}>荣誉榜</button>
          </div>

          {tab === "badges" && (
            <div className="honors-body">
              {featErr && <div className="honors-notice honors-notice-warn">{featErr}</div>}
              <div className="honors-summary">
                已解锁 <b>{unlockedCount}</b> / {AVAILABLE_COUNT} 枚一期成就 · 精选展示 <b>{featuredCodes.size}</b>/3 枚
                <span className="honors-summary-hint">点击已解锁成就可设为精选</span>
              </div>
              {badgeRows.map((cat) => (
                <section className="honors-cat" key={cat.key}>
                  <div className="honors-cat-title">{cat.label}</div>
                  <div className="honors-grid">
                    {cat.items.map((a) => {
                      const got = unlockedCodes.has(a.code);
                      const hidden = a.hidden && !got;
                      const featured = featuredCodes.has(a.code);
                      return (
                        <button
                          key={a.code}
                          className={`honors-ach rarity-${a.rarity}${got ? " got" : " locked"}${a.available ? "" : " upcoming"}${hidden ? " hidden" : ""}`}
                          disabled={!got || !a.available}
                          onClick={() => got && a.available && toggleFeatured(a)}
                          title={hidden ? "隐藏成就 · 条件暂不公开" : (got ? (featured ? "取消精选" : "设为精选徽章") : a.desc)}
                        >
                          <span className="honors-ach-glyph">{hidden ? "?" : a.glyph}</span>
                          <span className="honors-ach-main">
                            <span className="honors-ach-name">{hidden ? "隐藏成就" : a.name}</span>
                            <span className="honors-ach-desc">{hidden ? "条件暂不公开" : a.desc}</span>
                          </span>
                          <span className="honors-ach-tags">
                            <span className="honors-rarity">{RARITY[a.rarity].short}</span>
                            {!a.available ? <span className="honors-state">二期开放</span>
                              : got ? <span className="honors-state got">{featured ? "★ 精选中" : "已解锁"}</span>
                                : <span className="honors-state">未解锁</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <div className="honors-about">
                <div className="honors-cat-title">关于荣誉体系</div>
                <p>· 等级只代表参与度，不是管理权限；不会影响发帖、私信或公告权限。</p>
                <p>· 积分由服务端按真实行为判定：主题 +8 XP、回复 +2 XP、被认可 +3 XP / +1 声望，每日有上限。</p>
                <p>· 浏览量不参与任何计分；点赞由服务端唯一约束去重；删帖只标记不追扣等级。</p>
                <p>· 仅公开等级与已获徽章；积分流水、原始行为记录、最后活跃日期不对外公开。私信与群聊内容永不参与计算。</p>
              </div>
            </div>
          )}

          {tab === "log" && (
            <div className="honors-body">
              <div className="honors-summary">最近 40 条成长记录（仅本人可见）</div>
              {myGrowth && (
                <div className="honors-next">
                  {(() => {
                    const p = levelProgress(Number(myGrowth.total_xp || 0));
                    return p.isMax
                      ? "已达最高等级 STG 传奇，感谢你一路同行。"
                      : `当前 ${p.cur.title} · ${p.pct}% · 再获得 ${p.toNext} XP 升级为 ${p.next.title}`;
                  })()}
                </div>
              )}
              {xpLog.length === 0 ? (
                <div className="honors-notice">暂无记录。发布主题、回复或被认可后会出现在这里。</div>
              ) : (
                <ul className="honors-log">
                  {xpLog.map((r, i) => (
                    <li key={i} className={r.reversed ? "reversed" : ""}>
                      <span className="honors-log-dot" />
                      <span className="honors-log-label">
                        {XP_EVENT_LABELS[r.event_type] || r.event_type}
                        {r.reversed && <em> · 关联内容已删除</em>}
                      </span>
                      <span className="honors-log-time">{fmtTime(r.created_at)}</span>
                      <span className="honors-log-xp">+{Number(r.amount || 0)} XP</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "board" && (
            <div className="honors-body">
              <div className="honors-summary">仅展示已主动开启荣誉体系的成员 · 按累计 XP 排序</div>
              {board.length === 0 ? (
                <div className="honors-notice">还没有成员加入荣誉体系。</div>
              ) : (
                <ul className="honors-board">
                  {board.map((p, i) => (
                    <li key={p.user_id} className={user?.username === p.username ? "me" : ""}>
                      <span className={`honors-rank rank-${i + 1}`}>{i + 1}</span>
                      <span className="honors-board-name">{p.username}</span>
                      <LevelChip level={p.level} compact />
                      <span className="honors-board-xp">{Number(p.total_xp || 0).toLocaleString()} XP</span>
                      <span className="honors-board-rep">声望 {Number(p.reputation || 0).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
