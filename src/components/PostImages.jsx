import React, { useState } from "react";

// 帖子图片网格 + 点击放大。图片是压缩后的 data URL（每张 ≤200KB），
// 数据来自 posts.images（v16 迁移新增列），缺列时降级为空数组。
export default function PostImages({ images, detail = false }) {
  const [zoom, setZoom] = useState(null);
  const list = Array.isArray(images) ? images.filter((s) => typeof s === "string" && s.startsWith("data:image/")).slice(0, 3) : [];
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
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="presentation">
          <img src={zoom} alt="图片预览" onClick={(e) => e.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setZoom(null)} aria-label="关闭">×</button>
        </div>
      )}
    </>
  );
}
