import React, { useRef, useState } from "react";
import { compressImage, MAX_IMAGE_BYTES } from "../growth";
import { showToast } from "../utils";

// 通用「选图 → 压缩」按钮：发帖 / 私信共用。
// 输出恒为 ≤200KB 的 data URL，服务端 v16 迁移会复核体积。
export default function ImageAttachButton({ onImage, disabled, title = "添加图片（自动压缩到 200KB）", className = "compose-tool", children }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type || "")) { showToast("请选择图片文件", 2400); return; }
    setBusy(true);
    try {
      const out = await compressImage(file, MAX_IMAGE_BYTES, 1024);
      onImage?.(out.dataUrl, out);
    } catch (e) {
      showToast(String(e?.message || "图片处理失败"), 3200);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={disabled || busy}
        title={title} onClick={() => inputRef.current?.click()}>
        {busy ? "…" : children}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
