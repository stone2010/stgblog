import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HonorEmblem from "./HonorEmblem";
import { RARITY, CATEGORY_LABEL, achievementPoints } from "../honors";

// 徽章悬浮展签：把 60px 左右的小徽章放大成一张可读的陈列卡。
// 只展示真实数据（解锁日期 / 站内持有人数 / 进度 / 是否正在主页展示），
// 不推算、不编造任何数字。位置用 fixed + 视口夹取，不受滚动容器裁切影响。

const POP_W = 292;
const EDGE = 10;
const EST_H = 380;

function fmtDate(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

export default function HonorPopover({
  achievement, got = true, hidden = false, date, holders = 0,
  progress = null, featured = false, children, className = "",
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchorRef = useRef(null);
  const cardRef = useRef(null);
  const hideTimer = useRef(null);
  const rawId = useId();
  const tipId = `hpop-${String(rawId).replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };
  const show = () => { cancelHide(); setOpen(true); };
  const hideSoon = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useEffect(() => () => cancelHide(), []);

  useEffect(() => {
    const onClose = () => setOpen(false);
    window.addEventListener("stgblog:hpop-close", onClose);
    return () => window.removeEventListener("stgblog:hpop-close", onClose);
  }, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(POP_W, vw - EDGE * 2);
      const cx = r.left + r.width / 2;
      const half = w / 2;
      const left = Math.min(Math.max(cx, EDGE + half), vw - EDGE - half);
      const caret = Math.min(Math.max(cx - left, -half + 16), half - 16);
      const aboveSpace = r.top - EDGE;
      const belowSpace = vh - r.bottom - EDGE;
      const above = aboveSpace >= EST_H || aboveSpace >= belowSpace;
      setPos({
        left,
        top: above ? r.top - 12 : r.bottom + 12,
        side: above ? "top" : "bottom",
        width: w,
        caret,
      });
    };
    place();
    const onScroll = () => setOpen(false);
    const onResize = () => place();
    const onDown = (e) => {
      if (anchorRef.current?.contains(e.target) || cardRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  if (!achievement) return children || null;

  const meta = RARITY[achievement.rarity] || RARITY.common;
  const status = !achievement.available
    ? "二期开放"
    : got ? "已解锁" : hidden ? "条件不公开" : "未解锁";
  const dateText = got && date ? fmtDate(date) : "";
  const pct = progress ? Math.max(0, Math.min(100, Math.round(progress.pct))) : 0;
  const showProgress = !got && !hidden && achievement.available && progress;

  return (
    <>
      <span
        ref={anchorRef}
        className={`hpop-anchor${className ? ` ${className}` : ""}`}
        onPointerEnter={(e) => { if (e.pointerType !== "touch") show(); }}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") hideSoon(); }}
        onPointerDown={(e) => { if (e.pointerType === "touch") show(); }}
        onFocus={show}
        onBlur={hideSoon}
        aria-describedby={open ? tipId : undefined}
      >
        {children}
      </span>
      {open && pos && createPortal(
        <div
          ref={cardRef}
          id={tipId}
          role="tooltip"
          className={`hpop rarity-${achievement.rarity}${pos.side === "bottom" ? " hpop-below" : ""}`}
          style={{ left: pos.left, top: pos.top, width: pos.width, "--caret": `${pos.caret}px` }}
          onPointerEnter={cancelHide}
          onPointerLeave={hideSoon}
        >
          <div className="hpop-top">
            <span className="hpop-rarity"><i />{meta.label}</span>
            <span className="hpop-points">+{achievementPoints(achievement)} 图鉴分</span>
          </div>
          <div className="hpop-emblem">
            <HonorEmblem achievement={achievement} size={112} locked={!got} hidden={hidden} />
          </div>
          <h4 className="hpop-name">{hidden ? "隐藏成就" : achievement.name}</h4>
          <p className="hpop-desc">{hidden ? "继续探索，它会在解锁时现身。" : achievement.desc}</p>
          <dl className="hpop-facts">
            <div><dt>类别</dt><dd>{CATEGORY_LABEL[achievement.category]}</dd></div>
            <div><dt>状态</dt><dd>{dateText ? `${dateText}解锁` : status}</dd></div>
            {holders > 0 && <div><dt>全站</dt><dd>{holders} 人已解锁</dd></div>}
            {featured && <div><dt>展示</dt><dd>正在主页展示</dd></div>}
          </dl>
          {showProgress && (
            <div className="hpop-progress">
              <div className="hpop-bar"><i style={{ width: `${pct}%` }} /></div>
              <span>{progress.cur} / {progress.goal}</span>
            </div>
          )}
          <i className="hpop-caret" aria-hidden="true" />
        </div>,
        document.body
      )}
    </>
  );
}
