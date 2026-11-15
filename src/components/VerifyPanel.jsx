import React from "react";
import { useAuth } from "../context/AuthContext";
import { useGrowth } from "../context/GrowthContext";
import { VERIFY_GOAL, formatDuration, BASE_POST_CAP, BASE_COMMENT_CAP } from "../growth";
import IdentityMark from "./IdentityMark";

// 真人认证：点击按钮让后台 Web Worker 持续生成「反垃圾凭证」，
// 服务端复验凭证并按真实在线时长累计；满 1 小时发蓝色认证标识并解除每日限额。
export default function VerifyPanel() {
  const { user } = useAuth();
  const growth = useGrowth();
  const s = growth.state;
  const v = growth.verify;
  const verified = !!s?.is_verified;
  const seconds = Number(s?.pow_seconds || v.seconds || 0);
  const pct = Math.min(100, Math.round((seconds / VERIFY_GOAL) * 100));

  if (!user) return <div className="growth-hint">登录后才能开始真人认证计算。</div>;
  if (growth.ready === false) return (
    <div className="growth-hint">
      <b>真人认证尚未启用</b>
      <p>需要管理员先执行 <code>migrations/v13_growth.sql</code>。在此之前网站不会限制发帖与评论，也不会启动任何后台计算。</p>
    </div>
  );
  if (!s) return <div className="growth-hint">正在同步认证状态…</div>;

  return (
    <div className="growth-stack">
      <section className="growth-card verify-card">
        <div className="growth-card-head">
          <div>
            <span className="growth-kicker">PROOF OF HUMAN</span>
            <h3>真人认证 {verified && <IdentityMark kind="human" size={18} />}</h3>
            <p>累计在线计算满 1 小时，即可获得蓝色真人认证标识</p>
          </div>
          <div className="verify-ring" style={{ "--p": `${pct}%` }}>
            <b>{pct}%</b><span>进度</span>
          </div>
        </div>

        <div className="growth-bar verify-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="verify-stats">
          <div><b>{formatDuration(seconds)}</b><span>已累计在线计算</span></div>
          <div><b>{VERIFY_GOAL / 3600} 小时</b><span>认证目标</span></div>
          <div><b>{verified ? "已认证" : "未认证"}</b><span>当前状态</span></div>
        </div>

        <button className={`growth-cta${v.running ? " stop" : ""}${verified ? " done" : ""}`}
          disabled={verified} onClick={v.toggle}>
          {verified ? "✓ 已完成真人认证" : v.running ? "■ 停止计算" : "▶ 开始在线计算"}
        </button>
        {v.running && <p className="verify-live">计算中 · 已尝试 {(v.computed || 0).toLocaleString()} 次哈希 · 每 30 秒结算一次</p>}
        {v.error && <div className="growth-warn">{v.error}</div>}
      </section>

      <section className="growth-card">
        <div className="growth-card-head"><div><span className="growth-kicker">USEFUL WORK</span><h3>算出来的东西有什么用</h3></div></div>
        <ul className="verify-points">
          <li><b>不是空转</b>：后台在寻找 SHA-256 前导零 nonce，产出的是服务端可复验的 Hashcash 反垃圾凭证。</li>
          <li><b>立刻有用</b>：每枚未消费的凭证可兑换 1 次额外发帖 / 评论额度，超出每日 {BASE_POST_CAP} 篇 / {BASE_COMMENT_CAP} 条时自动使用。</li>
          <li><b>可审计</b>：凭证与在线时长都记在服务端，客户端改 localStorage 或伪造秒数都无效。</li>
          <li><b>不打扰</b>：计算放在独立 Web Worker，页面滚动、聊天、发帖都不卡；随时可以停止。</li>
        </ul>
        <p className="growth-foot">累计时长按「服务端上次结算 → 本次结算」的真实时间差计入，单次最多计 30 秒，杜绝瞬时刷满。</p>
      </section>
    </div>
  );
}
