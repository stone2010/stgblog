import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// 独立灯箱：用 portal 渲染到 document.body，彻底脱离帖子卡片的 onClick。
// 之前灯箱渲染在 <article className="post" onClick={...}> 内部，点背景/关闭按钮时
// 事件冒泡到卡片，意外打开帖子详情——用户看到的就是「点开图片后卡在界面上」。
// 现在挂到 body 根节点，点击不会再冒泡到任何业务容器；同时补上 ESC 关闭与背景滚动锁定。
export default function Lightbox({ src, alt = "图片预览", onClose }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const open = !!src;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  // 注意：createPortal 只改变 DOM 挂载点，React 合成事件仍沿「组件树」冒泡。
  // 灯箱组件在组件树里仍是 <article className="post"> 的后代，若不在这里截断，
  // 点灯箱会冒泡到卡片的 onClick → 意外打开帖子详情（即「卡在界面上」的 bug）。
  return createPortal(
    <div className="lightbox" onClick={(e) => { e.stopPropagation(); closeRef.current?.(); }} role="presentation">
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
      <button className="lightbox-close" onClick={(e) => { e.stopPropagation(); closeRef.current?.(); }} aria-label="关闭">×</button>
    </div>,
    document.body
  );
}
