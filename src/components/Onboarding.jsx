import React, { useState } from "react";
import { Icons } from "./Icons";

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "欢迎来到 STGBLOG",
      desc: "这是一个匿名校园社交论坛，你可以安全地表达想法。",
      feature: "匿名发布，保护隐私"
    },
    {
      title: "发布帖子",
      desc: "点击右下角 ➕ 按钮，即可发布匿名帖子，与同学互动。",
      feature: "自由表达，无需实名"
    },
    {
      title: "加密私信",
      desc: "支持端到端加密的私信聊天，只有双方能阅读消息。",
      feature: "端到端加密"
    },
    {
      title: "开始使用",
      desc: "点击右下角的 ➕ 按钮，发布你的第一条动态吧！",
      feature: "开始探索"
    }
  ];

  const stepData = steps[step];

  return (
    <div className="onboarding-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="onboarding-card">
        <div className="onboarding-header">
          <span className="step-badge">{step + 1} / {steps.length}</span>
          <button className="onboarding-close" onClick={() => {
            localStorage.setItem("stgblog_onboarding_shown", "true");
            onComplete();
          }}>✕</button>
        </div>
        <div className="onboarding-content">
          <div className="onboarding-icon">🎓</div>
          <h2>{stepData.title}</h2>
          <p>{stepData.desc}</p>
          <div className="onboarding-feature">{stepData.feature}</div>
        </div>
        <div className="onboarding-footer">
          {step < steps.length - 1 ? (
            <button className="onboarding-next" onClick={() => setStep(step + 1)}>下一步 →</button>
          ) : (
            <button className="onboarding-next onboarding-next-primary" onClick={() => {
              localStorage.setItem("stgblog_onboarding_shown", "true");
              onComplete();
            }}>开始使用</button>
          )}
        </div>
      </div>
    </div>
  );
}
