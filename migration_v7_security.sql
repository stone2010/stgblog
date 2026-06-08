-- ============================================
-- STGBLOG v7.0 安全加固 Migration
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- ============================================
-- 1. 数据约束：防止垃圾数据
-- ============================================

-- 帖子内容不能为空，长度限制
ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS chk_content_not_empty
  CHECK (length(trim(content)) > 0);
ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS chk_content_length
  CHECK (length(content) <= 5000);
ALTER TABLE posts ADD CONSTRAINT IF NOT EXISTS chk_author_not_empty
  CHECK (length(trim(author)) > 0);

-- 用户名约束：只允许字母数字下划线，3-20位
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS chk_username_format
  CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$');

-- 密码长度至少6位
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS chk_password_length
  CHECK (length(password) >= 6);

-- 评论内容约束
ALTER TABLE comments ADD CONSTRAINT IF NOT EXISTS chk_comment_content
  CHECK (length(trim(content)) > 0 AND length(content) <= 2000);

-- ============================================
-- 2. 数据库原子函数（替代客户端 read-modify-write）
-- ============================================

-- 原子增加点赞数
CREATE OR REPLACE FUNCTION increment_likes(p_post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 原子增加浏览数
CREATE OR REPLACE FUNCTION increment_views(p_post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 原子增加转发数
CREATE OR REPLACE FUNCTION increment_reposts(p_post_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET reposts = COALESCE(reposts, 0) + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. 安全发帖函数（绕过宽松 RLS，服务端校验）
-- ============================================

CREATE OR REPLACE FUNCTION create_post(
  p_username TEXT,
  p_content TEXT,
  p_category TEXT DEFAULT '动态'
)
RETURNS posts AS $$
DECLARE
  new_post posts;
BEGIN
  -- 校验
  IF length(trim(p_content)) = 0 OR length(p_content) > 5000 THEN
    RAISE EXCEPTION '内容长度不合法';
  END IF;
  IF length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION '用户名不能为空';
  END IF;

  INSERT INTO posts (title, content, author, category, likes, views, reposts, pinned, edited)
  VALUES (
    left(p_content, 60),
    p_content,
    p_username,
    COALESCE(p_category, '动态'),
    0, 0, 0, false, false
  )
  RETURNING * INTO new_post;

  RETURN new_post;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 安全删除帖子函数（只能删自己的）
CREATE OR REPLACE FUNCTION delete_post(
  p_username TEXT,
  p_post_id BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
  post_author TEXT;
BEGIN
  SELECT author INTO post_author FROM posts WHERE id = p_post_id;
  IF post_author IS NULL THEN
    RAISE EXCEPTION '帖子不存在';
  END IF;
  IF post_author != p_username THEN
    RAISE EXCEPTION '只能删除自己的帖子';
  END IF;
  DELETE FROM posts WHERE id = p_post_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 安全编辑帖子函数（只能改自己的）
CREATE OR REPLACE FUNCTION edit_post(
  p_username TEXT,
  p_post_id BIGINT,
  p_content TEXT
)
RETURNS posts AS $$
DECLARE
  post_author TEXT;
  updated posts;
BEGIN
  IF length(trim(p_content)) = 0 OR length(p_content) > 5000 THEN
    RAISE EXCEPTION '内容长度不合法';
  END IF;
  SELECT author INTO post_author FROM posts WHERE id = p_post_id;
  IF post_author IS NULL THEN
    RAISE EXCEPTION '帖子不存在';
  END IF;
  IF post_author != p_username THEN
    RAISE EXCEPTION '只能编辑自己的帖子';
  END IF;
  UPDATE posts SET content = p_content, title = left(p_content, 60), edited = true
  WHERE id = p_post_id
  RETURNING * INTO updated;
  RETURN updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 安全关注函数（不能关注自己，防重复）
CREATE OR REPLACE FUNCTION follow_user(
  p_follower TEXT,
  p_following TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_follower = p_following THEN
    RAISE EXCEPTION '不能关注自己';
  END IF;
  INSERT INTO follows (follower, following)
  VALUES (p_follower, p_following)
  ON CONFLICT (follower, following) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 安全发送通知函数
CREATE OR REPLACE FUNCTION send_notification(
  p_user_to TEXT,
  p_user_from TEXT,
  p_type TEXT,
  p_post_id BIGINT DEFAULT NULL,
  p_comment_id BIGINT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_user_to = p_user_from THEN
    RETURN; -- 不给自己发通知
  END IF;
  INSERT INTO notifications (user_to, user_from, type, post_id, comment_id)
  VALUES (p_user_to, p_user_from, p_type, p_post_id, p_comment_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following);
CREATE INDEX IF NOT EXISTS idx_dm_messages_read ON dm_messages(receiver, read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_to, read);

-- ============================================
-- 5. 清理垃圾数据
-- ============================================
DELETE FROM posts WHERE author IN ('true', 'false', 'None', 'null', 'undefined', '');
DELETE FROM posts WHERE content IS NULL OR length(trim(content)) = 0;
