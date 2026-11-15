// STGBLOG v13 · 成长体系展示常量与纯前端工具
// 权威判定全在 Postgres（migrations/v13_growth.sql）；这里只做展示与本地压缩。

export const MAX_FEATURED = 5;          // 个人主页徽章展示位
export const UPLOAD_LEVEL = 4;          // 头像 / 背景图解锁等级
export const MAX_IMAGE_BYTES = 200 * 1024;
export const VERIFY_GOAL = 3600;        // 累计在线计算 1 小时
export const POW_ZEROS = 4;             // Hashcash 凭证前导 0 个数
export const POW_BATCH_MS = 30000;      // 每 30 秒向服务端结算一次
export const BASE_POST_CAP = 3;
export const BASE_COMMENT_CAP = 5;

// 参考小米社区「成长值 → 等级 → 已解锁权益」的展示方式
export const LEVEL_RIGHTS = [
  { level: 1, right: "参与主题与回复" },
  { level: 2, right: "解锁成长记录明细" },
  { level: 3, right: "登上社区荣誉榜" },
  { level: 4, right: "自定义头像与主页背景" },
  { level: 5, right: "5 枚徽章展示位全开" },
  { level: 6, right: "专属等级称号" },
  { level: 7, right: "优先参与社区话题" },
  { level: 8, right: "社区核心标识" },
  { level: 9, right: "荣誉成员标识" },
  { level: 10, right: "STG 传奇 · 最高等级" },
];

export const TASK_META = {
  signin: { icon: "📅", hint: "连续签到第 3 / 7 / 14 / 30 天有额外经验" },
  first_post: { icon: "✎", hint: "每天发布的第一篇主题自动计入" },
  first_reply: { icon: "💬", hint: "每天第一条回复自动计入" },
};

export function formatDuration(sec = 0) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} 小时 ${m} 分`;
  if (m) return `${m} 分 ${r} 秒`;
  return `${r} 秒`;
}

export function quotaMessage(msg) {
  const s = String(msg || "");
  if (/封禁/.test(s)) return "账号已被封禁，暂时无法发布内容。如有疑问请联系管理员。";
  if (/每日最多发 3 篇/.test(s)) return "今日 3 篇主题的免费额度已用完。完成真人认证，或让计算任务多跑一会儿获得反垃圾凭证，即可继续发布。";
  if (/每日最多发 5 条/.test(s)) return "今日 5 条评论的免费额度已用完。完成真人认证，或用计算凭证兑换额外额度后即可继续。";
  if (/Lv\.4|需要达到/.test(s)) return "自定义头像与主页背景需要达到 Lv.4，继续签到和发帖就能升级。";
  return s || "网络错误，请稍后重试";
}

// ─── 图片压缩：任何输入都收敛到 ≤200KB 的 data URL ───────────────────────────
// 先按最大边长降采样，再在 webp/jpeg 质量上二分，最后按 base64 实际字节数复核。
function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("读取图片失败"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("不是有效的图片文件"));
      img.onload = () => resolve(img);
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

function drawScaled(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return cv;
}

function pickMime() {
  try {
    const cv = document.createElement("canvas");
    cv.width = 1; cv.height = 1;
    return cv.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
  } catch { return "image/jpeg"; }
}

export async function compressImage(file, maxBytes = MAX_IMAGE_BYTES, maxSide = 1024) {
  if (!file || !/^image\//.test(file.type || "")) throw new Error("请选择图片文件");
  const img = await loadImage(file);
  const mime = pickMime();
  let side = maxSide;
  let best = null;
  // 四轮降采样 + 每轮质量递减；webp 在多数浏览器下同体积画质更好
  for (let pass = 0; pass < 4; pass++) {
    const cv = drawScaled(img, side);
    for (const q of [0.82, 0.68, 0.52, 0.38, 0.26, 0.16]) {
      const url = cv.toDataURL(mime, q);
      const bytes = dataUrlBytes(url);
      if (!best || bytes < best.bytes) best = { dataUrl: url, bytes };
      if (bytes <= maxBytes) return { dataUrl: url, bytes, mime, width: cv.width, height: cv.height };
    }
    side = Math.max(160, Math.round(side * 0.7));
  }
  throw new Error("这张图片压缩后仍超过 200KB，请换一张尺寸更小的图片");
}
