-- ============================================
-- STGBLOG v3.0 Migration
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 关注关系表
CREATE TABLE IF NOT EXISTS follows (
  id BIGSERIAL PRIMARY KEY,
  follower TEXT NOT NULL,      -- 关注者
  following TEXT NOT NULL,     -- 被关注者
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower, following)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following);

-- 2. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_to TEXT NOT NULL,           -- 通知接收者
  user_from TEXT NOT NULL,         -- 通知触发者
  type TEXT NOT NULL,              -- 'like' | 'comment' | 'follow' | 'reply'
  post_id BIGINT,                  -- 相关帖子（可为空）
  comment_id BIGINT,               -- 相关评论（可为空）
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notifications_user_to ON notifications(user_to);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_to, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 3. 用户资料扩展字段（bio）
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';

-- 4. RLS 策略（如果启用了 Row Level Security）
-- follows 表
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON follows FOR INSERT WITH CHECK (true);
CREATE POLICY "follows_delete" ON follows FOR DELETE USING (true);

-- notifications 表
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (true);
CREATE POLICY "notif_delete" ON notifications FOR DELETE USING (true);
