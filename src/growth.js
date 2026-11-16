// STGBLOG v13 · 成长体系展示常量与纯前端工具
// 权威判定全在 Postgres（migrations/v13_growth.sql）；这里只做展示与本地压缩。

export const MAX_FEATURED = 5;          // 个人主页徽章展示位
export const UPLOAD_LEVEL = 3;          // 头像 / 背景图解锁等级
export const MAX_IMAGE_BYTES = 200 * 1024;
export const VERIFY_GOAL = 3600;        // 累计在线计算 1 小时
export const POW_ZEROS = 4;             // Hashcash 凭证前导 0 个数
export const POW_BATCH_MS = 30000;      // 每 30 秒向服务端结算一次
export const BASE_POST_CAP = 3;
export const BASE_COMMENT_CAP = 5;

// 精华帖奖励：与 migrations/v14_admin_xp.sql 里的 c_featured_xp 必须一致。
// 普通主题 8 XP，精华一次给 50 XP —— 一次加精约等于六篇普通主题。
export const FEATURED_XP = 50;
// 超管单次发放上限（服务端同样限制在 -2000 ~ 2000）
export const GRANT_MAX = 2000;
export const GRANT_PRESETS = [10, 30, 50, 100, 200, 500];

// 参考小米社区「成长值 → 等级 → 已解锁权益」的展示方式
export const LEVEL_RIGHTS = [
  { level: 1, right: "参与主题与回复" },
  { level: 2, right: "解锁成长记录明细" },
  { level: 3, right: "自定义头像与主页背景" },
  { level: 4, right: "登上社区荣誉榜" },
  { level: 5, right: "5 枚徽章展示位全开" },
  { level: 6, right: "专属等级称号" },
  { level: 7, right: "优先参与社区话题" },
  { level: 8, right: "深孚众望标识" },
  { level: 9, right: "实至名归标识" },
  { level: 10, right: "登峰造极 · 最高等级" },
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
  if (/Lv\.\d|需要达到/.test(s)) return "自定义头像与主页背景需要达到 Lv.3，继续签到和发帖就能升级。";
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

// 裁切弹窗需要先拿到 Image 再让用户选区，所以单独导出
export const loadImageFile = loadImage;

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

// 把原图上的一块矩形（自然像素坐标）画到目标画布上
function drawRegion(img, rect, outW, outH) {
  const cv = document.createElement("canvas");
  cv.width = outW; cv.height = outH;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
  return cv;
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

// 裁切后再压缩：rect 为原图自然像素坐标下的一块矩形。
// 复用同一套「降采样 + 质量二分」策略，保证输出仍 ≤200KB，服务端 274000 字符上限不会被击穿。
export async function compressCropped(img, rect, maxBytes = MAX_IMAGE_BYTES, maxSide = 1024) {
  if (!img || !rect || rect.w < 1 || rect.h < 1) throw new Error("裁切区域无效");
  const mime = pickMime();
  const ratio = rect.w / rect.h;
  let long = Math.min(maxSide, Math.max(rect.w, rect.h));
  let best = null;
  for (let pass = 0; pass < 4; pass++) {
    const outW = Math.max(1, Math.round(ratio >= 1 ? long : long * ratio));
    const outH = Math.max(1, Math.round(ratio >= 1 ? long / ratio : long));
    const cv = drawRegion(img, rect, outW, outH);
    for (const q of [0.82, 0.68, 0.52, 0.38, 0.26, 0.16]) {
      const url = cv.toDataURL(mime, q);
      const bytes = dataUrlBytes(url);
      if (!best || bytes < best.bytes) best = { dataUrl: url, bytes };
      if (bytes <= maxBytes) return { dataUrl: url, bytes, mime, width: outW, height: outH };
    }
    long = Math.max(160, Math.round(long * 0.7));
  }
  throw new Error("这个区域压缩后仍超过 200KB，请缩小选区或换一张图片");
}
