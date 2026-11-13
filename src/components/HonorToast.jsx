import React, { useEffect } from "react";
import { useHonors } from "../context/HonorsContext";
import { RARITY } from "../honors";

export default function HonorToast() {
  const { toast, dismissToast } = useHonors();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 5200);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;
  return (
    <div className={`honor-toast rarity-${toast.rarity}`} role="status" onClick={dismissToast}>
      <div className="honor-toast-glyph">{toast.glyph}</div>
      <div className="honor-toast-body">
        <div className="honor-toast-kicker">STG HONORS · 解锁成就 · {RARITY[toast.rarity].label}</div>
        <div className="honor-toast-name">{toast.name}</div>
        <div className="honor-toast-desc">{toast.desc}</div>
      </div>
      <button className="honor-toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(); }} aria-label="关闭">✕</button>
    </div>
  );
}
