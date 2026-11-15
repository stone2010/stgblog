import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGrowth } from "../context/GrowthContext";
import { useHonors } from "../context/HonorsContext";
import { showToast } from "../utils";
import { levelProgress } from "../honors";
import { LEVEL_RIGHTS, TASK_META, BASE_POST_CAP, BASE_COMMENT_CAP } from "../growth";

// 经验体系（参考小米社区「我的 → 成长值」）：签到、每日任务、等级与已解锁权益。
// 所有数值来自服务端 growth_state()；按钮只发起请求，不本地加分。
export default function GrowthTasks() {
  const { user } = useAuth();
  const growth = useGrowth();
  const honors = useHonors();
  const [busy, setBusy] = useState(false);
  const s = growth.state;
  const xp = Number(s?.total_xp || 0);
  const prog = levelProgress(xp);
  const curLevel = Number(s?.level || prog.cur.level || 1);
  const quota = s?.quota || { posts_used: 0, posts_cap: BASE_POST_CAP, comments_used: 0, comments_cap: BASE_COMMENT_CAP, stamps: 0 };

  const doSignin = async () => {
    if (busy) return;
    setBusy(true);
    const res = await growth.signin();
    if (res.error) showToast(res.error, 3400);
    else if (res.already) showToast("今天已经签到过啦，明天再来", 2400);
    else showToast(`✅ 签到成功 · 连续 ${res.streak} 天 · +${res.xp} XP`, 3200);
    setBusy(false);
  };

  if (!user) return <div className="growth-hint">登录后即可签到、领每日经验并查看等级权益。</div>;
  if (growth.ready === false) return (
    <div className="growth-hint">
      <b>经验体系尚未启用</b>
      <p>站点管理员需在 Supabase SQL Editor 执行一次 <code>migrations/v13_growth.sql</code>。在此之前，签到、真人认证、图片上传与管理员模式都不会产生任何数据，网站其余功能不受影响。</p>
    </div>
  );
  if (!s) return <div className="growth-hint">{growth.loading ? "正在同步成长数据…" : "暂无成长档案，稍后重试。"}</div>;

  return (
    <div className="growth-stack">
      {/* 签到 */}
      <section className="growth-card growth-signin">
        <div className="growth-card-head">
          <div>
            <span className="growth-kicker">DAILY CHECK-IN</span>
            <h3>每日签到</h3>
            <p>连续签到第 3 / 7 / 14 / 30 天有额外经验奖励</p>
          </div>
          <div className="growth-streak"><b>{Number(s.signin_streak || 0)}</b><span>连续天数</span></div>
        </div>
        <button className={`growth-cta${s.signin_today ? " done" : ""}`} disabled={busy || s.signin_today} onClick={doSignin}>
          {s.signin_today ? "✓ 今日已签到" : busy ? "签到中…" : "签到 +5 XP"}
        </button>
      </section>

      {/* 等级与权益 */}
      <section className="growth-card">
        <div className="growth-card-head">
          <div>
            <span className="growth-kicker">LEVEL {curLevel}</span>
            <h3>{prog.cur.title} · Lv.{curLevel}</h3>
            <p>累计 {xp.toLocaleString()} XP{prog.isMax ? " · 已达最高等级" : ` · 距 ${prog.next.title} 还差 ${prog.toNext} XP`}</p>
          </div>
        </div>
        <div className="growth-bar"><i style={{ width: `${prog.pct}%` }} /></div>
        <div className="growth-rights">
          {LEVEL_RIGHTS.map((r) => (
            <div key={r.level} className={`growth-right${r.level <= curLevel ? " on" : ""}`}>
              <span className="growth-right-lv">Lv.{r.level}</span>
              <span>{r.right}</span>
              <em>{r.level <= curLevel ? "已解锁" : "未解锁"}</em>
            </div>
          ))}
        </div>
      </section>

      {/* 每日任务 */}
      <section className="growth-card">
        <div className="growth-card-head"><div><span className="growth-kicker">DAILY TASKS</span><h3>今日任务</h3><p>每日自动结算，无需手动领取</p></div></div>
        <ul className="growth-tasks">
          {(s.tasks || []).map((t) => {
            const meta = TASK_META[t.code] || { icon: "✦", hint: "" };
            return (
              <li key={t.code} className={t.done ? "done" : ""}>
                <span className="growth-task-icon">{meta.icon}</span>
                <span className="growth-task-body"><b>{t.label}</b><small>{meta.hint}</small></span>
                <span className="growth-task-xp">{t.done ? "✓ 已完成" : `+${t.xp} XP`}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 今日额度 */}
      <section className="growth-card">
        <div className="growth-card-head"><div><span className="growth-kicker">DAILY QUOTA</span><h3>今日发布额度</h3><p>未认证账号每日 3 篇主题 / 5 条评论；凭证与认证可提升额度</p></div></div>
        <div className="growth-quota">
          <div><b>{quota.posts_used} / {quota.posts_cap > 999 ? "∞" : quota.posts_cap}</b><span>主题</span></div>
          <div><b>{quota.comments_used} / {quota.comments_cap > 999 ? "∞" : quota.comments_cap}</b><span>评论</span></div>
          <div><b>{quota.stamps || 0}</b><span>可用凭证</span></div>
        </div>
        <p className="growth-foot">主题 +8 XP、回复 +2 XP、被认可 +3 XP / +1 声望，均有服务端每日上限；浏览量不计分。</p>
      </section>
    </div>
  );
}
