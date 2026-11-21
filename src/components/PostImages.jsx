import React, { useState } from "react";
import Lightbox from "./Lightbox";

// 判断是否为可用图片地址：兼容旧的 base64 data URL 与新的 R2 https 直链。
export function isImageSrc(s) {
  return typeof s === "string" && (s.startsWith("data:image/") || /^https?:\/\//i.test(s));
}

// 帖子图片网格 + 点击放大。图片来自 posts.images（v16 列），可能是压缩后的
// data URL（≤200KB）或 Cloudflare R2 公开直链；缺列时降级为空数组。
export default function PostImages({ images, detail = false }) {
  const [zoom, setZoom] = useState(null);
  const list = Array.isArray(images) ? images.filter(isImageSrc).slice(0, 3) : [];
  if (list.length === 0) return null;
  const cls = `${detail ? "detail-images" : "post-images"} n${list.length}`;
  return (
    <>
      <div className={cls} onClick={(e) => e.stopPropagation()}>
        {list.map((src, i) => (
          <img key={i} src={src} alt={`帖子图片 ${i + 1}`} loading="lazy"
            onClick={() => setZoom(src)} />
        ))}
      </div>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}
