-- ============================================
-- STGBLOG v8 瀹夊叏杩佺Щ锛氬瘑鐮?bcrypt 鍝堝笇
-- 鍦?Supabase SQL Editor 涓墽琛屾鑴氭湰
-- ============================================

-- 1. 鍚敤 pgcrypto 鎵╁睍锛堢敤浜?bcrypt锛?CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. 娣诲姞鍝堝笇瀛楁
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 3. 鎶婄幇鏈夋槑鏂囧瘑鐮佽浆涓?bcrypt 鍝堝笇
--    锛堜粎澶勭悊杩樻病鏈?password_hash 鐨勮锛?UPDATE users
SET password_hash = crypt(password, gen_salt('bf'))
WHERE password_hash IS NULL AND password IS NOT NULL;

-- 4. 鍒涘缓瀹夊叏鐧诲綍鍑芥暟锛堜慨澶嶏細鐢ㄨ〃鍒悕闄愬畾鍒楀悕锛岄伩鍏嶄笌 RETURN TABLE 鍒楀悕鍐茬獊锛?CREATE OR REPLACE FUNCTION secure_login(p_username TEXT, p_password TEXT)
RETURNS TABLE(username TEXT, hash_id TEXT, pubkey TEXT, bio TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT u.username, u.hash_id, u.pubkey, u.bio
  FROM users u
  WHERE u.username = p_username
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 鍒涘缓瀹夊叏娉ㄥ唽鍑芥暟锛堜慨澶嶏細鐢?CTE 閬垮厤 INSERT 鍒楀悕涓?RETURN TABLE 鍒楀悕鍐茬獊锛?CREATE OR REPLACE FUNCTION secure_register(
  p_username TEXT,
  p_password TEXT,
  p_hash_id TEXT,
  p_pubkey TEXT
)
RETURNS TABLE(username TEXT, hash_id TEXT, pubkey TEXT, bio TEXT) AS $$
BEGIN
  -- 妫€鏌ョ敤鎴峰悕鏄惁宸插瓨鍦紙鐢ㄨ〃鍒悕闄愬畾鍒楀悕锛?  IF EXISTS (SELECT 1 FROM users u WHERE u.username = p_username) THEN
    RAISE EXCEPTION '鐢ㄦ埛鍚嶅凡瀛樺湪';
  END IF;

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO users (username, password_hash, hash_id, pubkey, bio)
    VALUES (
      p_username,
      crypt(p_password, gen_salt('bf')),
      p_hash_id,
      p_pubkey,
      ''
    )
    RETURNING *
  )
  SELECT i.username, i.hash_id, i.pubkey, i.bio FROM inserted i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 锛堝彲閫夛級楠岃瘉锛氭煡鐪嬭縼绉荤粨鏋?-- SELECT username, password IS NOT NULL AS has_plain, password_hash IS NOT NULL AS has_hash FROM users;

-- 7. 锛堝彲閫夛紝寤鸿鍦ㄧ‘璁や竴鍒囨甯稿悗鎵ц锛夊垹闄ゆ槑鏂囧瘑鐮佸垪
-- ALTER TABLE users DROP COLUMN IF EXISTS password;