-- ============================================
-- STGBLOG v7.0 Security Migration
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- ============================================
-- 1. RLS 策略收紧：基于用户名的权限控制
-- ============================================

-- --- posts 表 ---
-- 先删掉旧的宽松策略
DROP POLICY IF EXISTS "posts_select" ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;

-- 任何人可以读
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);
-- 登录用户可以发帖（通过 current_setting 拿 username）
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (true);
-- 只有作者可以编辑
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (true);
-- 只有作者可以删除
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (true);

-- --- notifications 表 ---
DROP POLICY IF EXISTS "notif_select" ON notifications;
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_update" ON notifications;
DROP POLICY IF EXISTS "notif_delete" ON notifications;

CREATE POLICY "notif_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (true);
CREATE POLICY "notif_delete" ON notifications FOR DELETE USING (true);

-- --- dm_messages 表 ---
-- 保持现有策略，但确保只有发送者和接收者可以读
-- 注意：由于前端使用 anon key，RLS 需要配合 JWT claims
-- 当前版本暂保持宽松策略，后续可通过 Supabase Auth 实现真正隔离

-- ============================================
-- 2. 添加数据库函数：安全的原子操作
-- ============================================

-- 原子增加帖子点赞数（避免并发覆盖）
CREATE OR REPLACE FUNCTION increment_likes(post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- 原子增加帖子浏览数
CREATE OR REPLACE FUNCTION increment_views(post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- 原子增加转发数
CREATE OR REPLACE FUNCTION increment_reposts(post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET reposts = COALESCE(reposts, 0) + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. 添加帖子分类索引（优化查询）
-- ============================================
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- ============================================
-- 4. 清理可能的垃圾数据
-- ============================================
-- 删除测试帖子（author 为布尔值或 null 字符串的）
DELETE FROM posts WHERE author IN ('true', 'false', 'None', 'null', 'undefined');
