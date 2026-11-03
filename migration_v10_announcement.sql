-- ═══════════════════════════════════════════════════════════
-- migration_v10_announcement.sql
-- 公告机制：帖子表增加 is_announcement 标志
-- 使用方法：在 Supabase Dashboard → SQL Editor 中运行一次即可
-- ═══════════════════════════════════════════════════════════

-- 1. 公告标志列（默认普通帖子）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;

-- 2. 公告查询索引（弹窗按时间取最新公告）
CREATE INDEX IF NOT EXISTS idx_posts_is_announcement
  ON posts (is_announcement, created_at DESC);

-- 3. （可选）把历史上某个帖子设为公告：
--    UPDATE posts SET is_announcement = true WHERE id = <帖子ID>;

-- 完成。发布公告：管理员登录 → 发帖框 → 勾选「📢 公告」→ 发布。
-- 所有用户首次打开网页时会弹窗展示一次，点「知道了」后不再出现。
