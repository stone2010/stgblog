import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadImageFile, compressCropped } from "../growth";

// 图片裁切弹窗：固定取景框 + 拖动/缩放图片，所见即所得。
// 为什么不用「可拖动选框」：手机端拖选框容易误触，且缩放后选框会跑出图片边界；
// 固定框 + 移动图片是微信/微博一致的交互，两边都能用。
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function ImageCropModal({ file, aspect = 1, round = false, title = "调整图片", onCancel, onConfirm }) {
  const [img, setImg] = useState(null);
  const [err, setErr] = useState("");
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  const viewRef = useRef(null);
  const dragRef = useRef(null);
  const initedRef = useRef("");
  // 事件回调里需要读到最新的 zoom/off，用 ref 兜住，避免闭包过期
  const stateRef = useRef({ zoom: 1, off: { x: 0, y: 0 } });
  stateRef.current = { zoom, off };

  const natW = img?.naturalWidth || 0;
  const natH = img?.naturalHeight || 0;
  const base = natW && natH && box.w && box.h ? Math.max(box.w / natW, box.h / natH) : 1;
  const scale = base * zoom;
  const rw = natW * scale;
  const rh = natH * scale;

  // ─── 读图 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setImg(null); setErr(""); setZoom(1); setOff({ x: 0, y: 0 });
    initedRef.current = "";
    if (!file) return undefined;
    loadImageFile(file)
      .then((im) => { if (alive) setImg(im); })
      .catch((e) => { if (alive) setErr(String(e?.message || "无法读取这张图片")); });
    return () => { alive = false; };
  }, [file]);

  // ─── 量取景框尺寸（容器变化 / 图片加载后都要重算）──────────────────────
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── 首次把图片居中（同一张图 + 同一尺寸只做一次，避免重置用户的手动位置）
  useEffect(() => {
    if (!natW || !natH || !box.w || !box.h) return;
    const key = `${natW}x${natH}@${box.w}x${box.h}`;
    if (initedRef.current === key) return;
    initedRef.current = key;
    setZoom(1);
    setOff({ x: (box.w - natW * base) / 2, y: (box.h - natH * base) / 2 });
  }, [natW, natH, box.w, box.h, base]);

  // ─── 边界收敛：任何时候图片都必须盖满取景框，不能露白 ──────────────────
  useEffect(() => {
    if (!rw || !rh) return;
    setOff((o) => {
      const nx = clamp(o.x, box.w - rw, 0);
      const ny = clamp(o.y, box.h - rh, 0);
      return nx === o.x && ny === o.y ? o : { x: nx, y: ny };
    });
  }, [rw, rh, box.w, box.h]);

  const applyZoom = useCallback((next) => {
    const z0 = stateRef.current.zoom;
    const z1 = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(z1 - z0) < 0.001) return;
    const k = z1 / z0;
    setOff((o) => ({
      x: clamp(box.w / 2 - (box.w / 2 - o.x) * k, box.w - rw * k, 0),
      y: clamp(box.h / 2 - (box.h / 2 - o.y) * k, box.h - rh * k, 0),
    }));
    setZoom(z1);
  }, [box.w, box.h, rw, rh]);

  // ─── 滚轮缩放（必须非 passive，否则 preventDefault 无效、页面会跟着滚）──
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom(stateRef.current.zoom * Math.exp(-e.deltaY * 0.0016));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // ─── 拖动图片（Pointer 事件同时覆盖鼠标与触摸）─────────────────────────
  const onPointerDown = (e) => {
    if (!img || busy) return;
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setOff({
      x: clamp(d.ox + (e.clientX - d.x), box.w - rw, 0),
      y: clamp(d.oy + (e.clientY - d.y), box.h - rh, 0),
    });
  };
  const endDrag = (e) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  // ─── 锁定页面滚动 + ESC 取消 ───────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const confirm = async () => {
    if (!img || busy || !scale) return;
    setBusy(true);
    setErr("");
    try {
      // 取景框 → 原图自然像素坐标
      const x = clamp(-off.x / scale, 0, Math.max(0, natW - 1));
      const y = clamp(-off.y / scale, 0, Math.max(0, natH - 1));
      const w = Math.min(box.w / scale, natW - x);
      const h = Math.min(box.h / scale, natH - y);
      const out = await compressCropped(img, { x, y, w, h });
      onConfirm?.(out);
    } catch (e) {
      setErr(String(e?.message || "裁切失败，请重试"));
      setBusy(false);
    }
  };

  // 挂到 body：避免被个人主页里带 transform / overflow 的祖先裁掉或错位
  const node = (
    <div className="crop-mask" role="dialog" aria-modal="true" aria-label={title}>
      <div className="crop-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="crop-head">
          <b>{title}</b>
          <button type="button" className="crop-x" onClick={onCancel} aria-label="关闭">✕</button>
        </div>

        <div
          ref={viewRef}
          className={`crop-view${round ? " is-round" : ""}${dragRef.current ? " dragging" : ""}`}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {img ? (
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{ left: off.x, top: off.y, width: rw, height: rh }}
            />
          ) : (
            <div className="crop-empty">{err || "正在读取图片…"}</div>
          )}
          {img && <span className="crop-grid" aria-hidden="true" />}
        </div>

        <p className="crop-tip">
          拖动图片调整位置，用下方滑块缩放。框内即为最终效果。
        </p>

        <div className="crop-zoom">
          <button type="button" onClick={() => applyZoom(zoom - 0.25)} aria-label="缩小" disabled={zoom <= MIN_ZOOM}>－</button>
          <input
            type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="缩放"
          />
          <button type="button" onClick={() => applyZoom(zoom + 0.25)} aria-label="放大" disabled={zoom >= MAX_ZOOM}>＋</button>
        </div>

        {err && img && <p className="crop-err">{err}</p>}

        <div className="crop-actions">
          <button type="button" className="crop-btn" onClick={onCancel} disabled={busy}>取消</button>
          <button type="button" className="crop-btn primary" onClick={confirm} disabled={!img || busy}>
            {busy ? "处理中…" : "确定使用"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
