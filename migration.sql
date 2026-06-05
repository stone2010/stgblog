-- ============================================
-- STGBLOG v4.0 Migration
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. posts 表新增字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposts INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of BIGINT;          -- 转发的原帖ID
ALTER TABLE posts ADD COLUMN IF NOT EXISTS quote_of BIGINT;           -- 引用的原帖ID
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;

-- 索引
CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of);
CREATE INDEX IF NOT EXISTS idx_posts_quote_of ON posts(quote_of);

-- 2. dm_messages 表新增加密字段 + 已读字段
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS encrypted BOOLEAN DEFAULT FALSE;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS ciphertext TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS iv TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS sender_pubkey TEXT;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_dm_messages_read ON dm_messages(receiver, read);
CREATE INDEX IF NOT EXISTS idx_dm_messages_encrypted ON dm_messages(encrypted);

-- 3. notifications 表新增类型支持 (repost, quote)
-- type 字段已经是 TEXT 类型，无需修改表结构
-- 新增的 type 值: 'repost', 'quote'

-- 4. 关注关系表
CREATE TABLE IF NOT EXISTS follows (
  id BIGSERIAL PRIMARY KEY,
  follower TEXT NOT NULL,
  following TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower, following)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following);

-- 5. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_to TEXT NOT NULL,
  user_from TEXT NOT NULL,
  type TEXT NOT NULL,
  post_id BIGINT,
  comment_id BIGINT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_to ON notifications(user_to);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_to, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 6. 用户资料扩展字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pubkey TEXT;

-- 7. RLS 策略
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert" ON follows FOR INSERT WITH CHECK (true);
CREATE POLICY "follows_delete" ON follows FOR DELETE USING (true);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (true);
CREATE POLICY "notif_delete" ON notifications FOR DELETE USING (true);
