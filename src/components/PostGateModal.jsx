import React from "react";

// 发帖门禁弹窗：把「真人认证 / PoW 算力凭证」与发帖的关系讲清楚。
// guide = 未认证用户点发帖时的引导（可跳过）；quota = 今日额度用完时的拦截。
// 纯前端展示，所有额度判定仍由服务端 growth_quota_guard 触发器权威裁决。
export default function PostGateModal({ mode, onVerify, onSkip, onClose, quota, imageQuota }) {
  if (!mode) return null;
  const isGuide = mode === "guide";
  const used = quota?.posts_used ?? 0;
  const cap = quota?.posts_cap ?? 3;
  const stamps = quota?.stamps ?? 0;
  const sec = Number(quota?.pow_seconds ?? 0);
  const pct = Math.min(100, Math.round((sec / 3600) * 100));
  const iq = imageQuota || null;
  const imgPct = iq?.unlimited ? 100 : Math.min(100, Math.round(((sec % 600) / 600) * 100));

  return (
    <div className="pgate-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) (isGuide ? onSkip : onClose)?.(); }}>
      <div className="pgate-modal" role="dialog" aria-modal="true" aria-label={isGuide ? "发帖前认证提示" : "发帖额度提示"}>
        <div className="pgate-top">
          <span className="pgate-kicker">{isGuide ? "PROOF OF HUMAN" : "DAILY QUOTA"}</span>
          <button className="pgate-close" aria-label="关闭" onClick={isGuide ? onSkip : onClose}>×</button>
        </div>

        <div className="pgate-badge">{isGuide ? "✦" : "✎"}</div>
        <h3 className="pgate-title">{isGuide ? "发帖前，先证明你是真人" : "今日免费额度已用完"}</h3>
        <p className="pgate-desc">
          {isGuide
            ? "为减少垃圾灌水，未认证账号每天可免费发 3 篇。做一次真人认证（后台计算，不打扰你使用），即可解除限制；算出的算力凭证也能每题外换 1 篇。"
            : `你今天已发 ${used} / ${cap} 篇，免费额度用完了。完成真人认证可不限量发帖；或让后台计算多跑一会儿，每枚算力凭证可再换 1 篇。`}
        </p>

        {(isGuide || stamps > 0 || sec > 0) && (
          <div className="pgate-stats">
            <div><b>{isGuide ? "3 篇 / 天" : `${used}/${cap}`}</b><span>{isGuide ? "未认证免费额度" : "今日已发 / 上限"}</span></div>
            <div><b>{stamps} 枚</b><span>可用算力凭证</span></div>
            <div><b>{pct}%</b><span>真人认证进度</span></div>
          </div>
        )}

        {iq && !isGuide && (
          <>
            <div className="pgate-stats">
              <div><b>{iq.used}/{iq.cap}</b><span>今日图片已用 / 上限</span></div>
              <div><b>{iq.unlimited ? "不限" : `${Math.ceil((iq.next_in || 0) / 60)} 分`}</b><span>{iq.unlimited ? "认证/精华/管理员" : "下批 3 张到账"}</span></div>
            </div>
            {!iq.unlimited && <div className="pgate-bar"><i style={{ width: `${imgPct}%` }} /></div>}
          </>
        )}

        {isGuide && (
          <div className="pgate-bar"><i style={{ width: `${pct}%` }} /></div>
        )}

        <div className="pgate-actions">
          <button className="pgate-btn primary" onClick={onVerify}>
            {isGuide ? "去真人认证 →" : "去算凭证 →"}
          </button>
          <button className="pgate-btn ghost" onClick={isGuide ? onSkip : onClose}>
            {isGuide ? "跳过，继续发帖" : "知道了"}
          </button>
        </div>
        <p className="pgate-foot">认证状态与额度由服务端判定，本地改动或伪造无效。</p>
      </div>
    </div>
  );
}
