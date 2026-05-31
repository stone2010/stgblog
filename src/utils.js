// 生成匿名内部ID
export function generateHash() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "STG-";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 热门排序（带时间衰减）
export function getHotPosts(posts) {
  const now = Date.now();
  return [...posts].sort((a, b) => {
    const ageA = (now - new Date(a.created_at).getTime()) / 3600000;
    const ageB = (now - new Date(b.created_at).getTime()) / 3600000;
    const scoreA = ((a.likes || 0) * 5 + (a.views || 0) * 0.2 + (a.comment_count || 0) * 3 + (a.pinned ? 1000 : 0))
      / Math.pow(ageA + 2, 1.5);
    const scoreB = ((b.likes || 0) * 5 + (b.views || 0) * 0.2 + (b.comment_count || 0) * 3 + (b.pinned ? 1000 : 0))
      / Math.pow(ageB + 2, 1.5);
    return scoreB - scoreA;
  });
}

// 智能推荐算法（优化版）
// 因素：时间新鲜度、互动量、内容质量、关注关系、多样性、用户偏好
export function getRecommendPosts(posts, { followingSet = new Set(), likedPosts = new Set() } = {}) {
  const now = Date.now();

  const scored = posts.map((post) => {
    const ageHours = (now - new Date(post.created_at).getTime()) / 3600000;

    // 1. 时间衰减（指数衰减，48小时半衰期）
    const timeFactor = Math.exp(-ageHours / 48);

    // 2. 互动得分（对数缩放，防爆）
    const likes = post.likes || 0;
    const views = post.views || 0;
    const comments = post.comment_count || 0;
    const engagementScore = Math.log1p(likes * 3 + comments * 5 + views * 0.05);

    // 3. 内容质量（长度适中的内容质量更高）
    const len = post.content?.length || 0;
    const qualityBonus = len > 50 && len < 500 ? 1.3 : len >= 500 ? 1.1 : 1.0;

    // 4. 关注关系加成
    const followBonus = followingSet.has(post.author) ? 2.5 : 1.0;

    // 5. 已点赞内容的相似作者加成
    const likedBonus = likedPosts.has(post.id) ? 0.3 : 1.0;

    // 6. 置顶加成
    const pinBonus = post.pinned ? 500 : 0;

    // 7. 新作者探索加成（降低已有一定曝光的帖子权重）
    const exploreBonus = (views < 10) ? 1.5 : (views < 50) ? 1.2 : 1.0;

    const score = (engagementScore * qualityBonus * followBonus * likedBonus * exploreBonus + pinBonus) * timeFactor;

    return { ...post, _score: score };
  });

  // 多样性：同一作者最多连续出现2次，且间隔至少3条
  scored.sort((a, b) => b._score - a._score);

  const result = [];
  const authorLastIdx = {};
  for (const post of scored) {
    const lastIdx = authorLastIdx[post.author] ?? -1;
    if (lastIdx >= 0 && result.length - lastIdx < 3 && result.length > 5) continue;
    result.push(post);
    authorLastIdx[post.author] = result.length - 1;
  }

  return result;
}

export function hasLiked(postId) {
  try {
    const likedPosts = JSON.parse(localStorage.getItem("likedPosts")) || [];
    return likedPosts.includes(postId);
  } catch { return false; }
}

export function saveLiked(postId) {
  try {
    const likedPosts = JSON.parse(localStorage.getItem("likedPosts")) || [];
    if (!likedPosts.includes(postId)) {
      likedPosts.push(postId);
      localStorage.setItem("likedPosts", JSON.stringify(likedPosts));
    }
  } catch {}
}

export function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("likedPosts")) || []);
  } catch { return new Set(); }
}

export function hasViewed(postId) {
  try {
    const viewedPosts = JSON.parse(localStorage.getItem("viewedPosts")) || {};
    const lastView = viewedPosts[postId];
    if (!lastView) return false;
    return Date.now() - lastView < 30 * 60 * 1000;
  } catch { return false; }
}

export function saveViewed(postId) {
  try {
    const viewedPosts = JSON.parse(localStorage.getItem("viewedPosts")) || {};
    viewedPosts[postId] = Date.now();
    // 清理过期记录（保留最近100条）
    const entries = Object.entries(viewedPosts).sort((a, b) => b[1] - a[1]).slice(0, 100);
    localStorage.setItem("viewedPosts", JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

// 格式化时间
export function formatTime(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天`;
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(d);
  } catch {
    return String(value);
  }
}

// 格式化数字
export function formatCount(n) {
  if (!n) return "0";
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// 构建评论树
export function buildTree(comments) {
  const map = {};
  const roots = [];
  comments.forEach((c) => { map[c.id] = { ...c, children: [] }; });
  comments.forEach((c) => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}
