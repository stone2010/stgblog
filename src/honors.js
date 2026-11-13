// STG HONORS · 规则与元数据（前端只读，权威计算全部在 Postgres 函数内）
// 这里只放「展示用常量」：等级称号、色阶、成就图鉴。任何积分数值都不在此计算。

export const HONORS_KEY = "stgblog_honors";
export const HONORS_SEEN_KEY = "stgblog_honors_seen";

export const LEVELS = [
  { level: 1,  xp: 0,    title: "初来者",    stage: "探索阶段", tone: "silver" },
  { level: 2,  xp: 100,  title: "探索者",    stage: "探索阶段", tone: "silver" },
  { level: 3,  xp: 250,  title: "参与者",    stage: "参与阶段", tone: "cyan" },
  { level: 4,  xp: 450,  title: "交流者",    stage: "参与阶段", tone: "cyan" },
  { level: 5,  xp: 700,  title: "建设者",    stage: "贡献阶段", tone: "emerald" },
  { level: 6,  xp: 1000, title: "贡献者",    stage: "贡献阶段", tone: "emerald" },
  { level: 7,  xp: 1400, title: "资深成员",  stage: "资深阶段", tone: "amethyst" },
  { level: 8,  xp: 1900, title: "社区核心",  stage: "资深阶段", tone: "amethyst" },
  { level: 9,  xp: 2500, title: "荣誉成员",  stage: "荣誉阶段", tone: "champagne" },
  { level: 10, xp: 3200, title: "STG 传奇",  stage: "传奇阶段", tone: "gold" },
];

export const RARITY = {
  common: { label: "普通", short: "COMMON" },
  rare:   { label: "稀有", short: "RARE" },
  epic:   { label: "史诗", short: "EPIC" },
  legend: { label: "传说", short: "LEGEND" },
};

export const CATEGORIES = [
  { key: "creation",  label: "创作与表达" },
  { key: "community", label: "社区贡献" },
  { key: "activity",  label: "活跃与坚持" },
  { key: "discovery", label: "探索与发现" },
  { key: "identity",  label: "特殊身份" },
  { key: "hidden",    label: "隐藏成就" },
];

// 一期 20 枚（available=true）与二期 10 枚占位（available=false）。
// 占位项只展示名称与「即将开放」，不伪造解锁条件。
export const ACHIEVEMENTS = [
  { code: "FIRST_POST",     name: "初次发声",   desc: "发布第一篇有效主题",                 category: "creation",  rarity: "common", glyph: "◆", available: true },
  { code: "POSTS_10",       name: "持续创作",   desc: "发布 10 篇有效主题",                 category: "creation",  rarity: "common", glyph: "▤", available: true },
  { code: "POSTS_50",       name: "内容创作者", desc: "发布 50 篇有效主题",                 category: "creation",  rarity: "rare",   glyph: "▦", available: true },
  { code: "QUALITY_AUTHOR", name: "优质作者",   desc: "发布 5 篇 300 字以上的长主题",       category: "creation",  rarity: "epic",   glyph: "✎", available: true },
  { code: "TOPIC_LEADER",   name: "话题引领者", desc: "3 篇主题各自获得 5 条以上回复",      category: "creation",  rarity: "legend", glyph: "✦", available: true },
  { code: "FIRST_REPLY",    name: "第一次回应", desc: "发布第一条有效回复",                 category: "community", rarity: "common", glyph: "◇", available: true },
  { code: "FIRST_DAY",      name: "初次访问",   desc: "完成首次有效参与",                   category: "activity",  rarity: "common", glyph: "○", available: true },
  { code: "DAYS_7",         name: "常驻成员",   desc: "累计有效参与 7 天",                  category: "activity",  rarity: "common", glyph: "◷", available: true },
  { code: "DAYS_30",        name: "熟悉的身影", desc: "累计有效参与 30 天",                 category: "activity",  rarity: "rare",   glyph: "◎", available: true },
  { code: "DAYS_90",        name: "长期同行",   desc: "累计有效参与 90 天",                 category: "activity",  rarity: "epic",   glyph: "⌘", available: true },
  { code: "DAYS_180",       name: "年度成员",   desc: "累计有效参与 180 天",                category: "activity",  rarity: "legend", glyph: "⌛", available: true },
  { code: "CURIOSITY",      name: "好奇心",     desc: "在 2 个内容分类下参与",              category: "discovery", rarity: "common", glyph: "◉", available: true },
  { code: "EXPLORER",       name: "探索者",     desc: "在 5 个内容分类下参与",              category: "discovery", rarity: "common", glyph: "⬡", available: true },
  { code: "ALL_FIELDS",     name: "全领域探索", desc: "覆盖全部 7 个内容分类",              category: "discovery", rarity: "epic",   glyph: "✧", available: true },
  { code: "OLD_DIGGER",     name: "旧帖考古",   desc: "参与 3 篇发布 90 天以上的主题",      category: "discovery", rarity: "rare",   glyph: "▣", available: true },
  { code: "COLD_FINDER",    name: "冷门发现者", desc: "让 3 篇长期无人讨论的主题重新被看见", category: "discovery", rarity: "epic",   glyph: "⌕", available: true },
  { code: "EARLY_RESIDENT", name: "早期居民",   desc: "在论坛早期阶段注册并有效参与",       category: "identity",  rarity: "epic",   glyph: "⚑", available: true },
  { code: "NIGHT_WANDERER", name: "深夜漫游者", desc: "在不同日期的深夜留下有效讨论",       category: "hidden",    rarity: "rare",   glyph: "☾", available: true, hidden: true },
  { code: "TIME_TRAVELER",  name: "时间旅行者", desc: "找到并参与一篇 120 天以上的主题",    category: "hidden",    rarity: "epic",   glyph: "⌖", available: true, hidden: true },
  { code: "ICEBREAKER",     name: "破冰者",     desc: "让一篇沉寂已久的主题重新获得讨论",   category: "hidden",    rarity: "epic",   glyph: "❖", available: true, hidden: true },
  { code: "THANKFUL_10",    name: "热心成员",   desc: "获得 10 次有效认可",                 category: "community", rarity: "common", glyph: "♡", available: false },
  { code: "THANKFUL_50",    name: "乐于助人",   desc: "获得 50 次有效认可",                 category: "community", rarity: "rare",   glyph: "❤", available: false },
  { code: "ANSWERER",       name: "社区解答者", desc: "10 条回复被提问者标记为有帮助",      category: "community", rarity: "epic",   glyph: "✚", available: false },
  { code: "TRUSTED",        name: "值得信赖",   desc: "获得 100 次有效认可",                category: "community", rarity: "legend", glyph: "✪", available: false },
  { code: "COLLECTOR",      name: "收藏家的认可", desc: "自己的主题累计获得一定数量收藏",    category: "hidden",    rarity: "rare",   glyph: "▧", available: false, hidden: true },
  { code: "DIALOGUE",       name: "对话的艺术", desc: "参与一场持续且有质量的讨论",         category: "hidden",    rarity: "epic",   glyph: "⇄", available: false, hidden: true },
  { code: "ACTIVITY",       name: "活动参与者", desc: "参加一次官方社区活动",               category: "identity",  rarity: "common", glyph: "◈", available: false },
  { code: "VETERAN",        name: "论坛元老",   desc: "注册满一年且有持续有效贡献",         category: "identity",  rarity: "epic",   glyph: "★", available: false },
  { code: "BUILDER",        name: "社区建设者", desc: "为论坛建设作出经确认的贡献",         category: "identity",  rarity: "legend", glyph: "⬢", available: false },
  { code: "STG_SPIRIT",     name: "STG 精神",   desc: "获得论坛官方授予的特殊荣誉",         category: "hidden",    rarity: "legend", glyph: "✺", available: false, hidden: true },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.code, a]));
export const AVAILABLE_COUNT = ACHIEVEMENTS.filter((a) => a.available).length;

export function levelOf(xp = 0) {
  let out = LEVELS[0];
  for (const l of LEVELS) if (Number(xp) >= l.xp) out = l;
  return out;
}

export function levelProgress(xp = 0) {
  const cur = levelOf(xp);
  const next = LEVELS[cur.level] || null; // LEVELS 下标 = level-1，故 cur.level 即下一级
  if (!next) return { cur, next: null, pct: 100, toNext: 0, isMax: true };
  const span = next.xp - cur.xp;
  const gained = Number(xp) - cur.xp;
  return { cur, next, pct: Math.max(0, Math.min(100, Math.round((gained / span) * 100))), toNext: Math.max(0, next.xp - Number(xp)), isMax: false };
}

export const XP_EVENT_LABELS = {
  post: "发布主题", reply: "发布回复", recognition: "获得认可",
  daily_first: "当日首次参与", backfill_post: "历史主题回填",
  backfill_reply: "历史回复回填", event: "社区活动",
};
