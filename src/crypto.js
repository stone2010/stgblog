// 端到端加密工具 - Web Crypto API (ECDH + AES-256-GCM)
// 密钥对在本地生成，永不离开设备

const EC_PARAMS = { name: 'ECDH', namedCurve: 'P-256' };
const AES_PARAMS = { name: 'AES-GCM', length: 256 };

// Base64 工具（分块处理，避免大消息栈溢出）
function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 生成 ECDH 密钥对
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(EC_PARAMS, true, ['deriveKey', 'deriveBits']);
  const pub = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  return { publicKey: pub, privateKey: priv };
}

// 从 JWK 导入公钥
async function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, EC_PARAMS, true, []);
}

// 从 JWK 导入私钥
async function importPrivateKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, EC_PARAMS, false, ['deriveKey', 'deriveBits']);
}

// 派生共享 AES 密钥（带结果缓存，避免每条消息重复 deriveKey）
const deriveCache = new Map(); // "privFingerprint|pubFingerprint" -> CryptoKey
async function deriveSharedKey(privateKeyJwk, publicKeyJwk) {
  try {
    const cacheKey = `${privateKeyJwk?.x || ''}|${publicKeyJwk?.x || ''}`;
    if (deriveCache.has(cacheKey)) return deriveCache.get(cacheKey);
    const privKey = await importPrivateKey(privateKeyJwk);
    const pubKey = await importPublicKey(publicKeyJwk);
    const key = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: pubKey },
      privKey,
      AES_PARAMS,
      false,
      ['encrypt', 'decrypt']
    );
    if (deriveCache.size > 50) {
      // 简单防膨胀：清空一半以上时全部清掉
      deriveCache.clear();
    }
    deriveCache.set(cacheKey, key);
    return key;
  } catch (e) {
    console.error("Failed to derive shared key:", e);
    throw new Error("密钥派生失败");
  }
}

// 加密消息
export async function encryptMessage(plaintext, privateKeyJwk, recipientPublicKeyJwk) {
  const sharedKey = await deriveSharedKey(privateKeyJwk, recipientPublicKeyJwk);
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, data);
  return {
    ciphertext: bufToBase64(encrypted),
    iv: bufToBase64(iv)
  };
}

// 解密消息
export async function decryptMessage(ciphertext, iv, privateKeyJwk, senderPublicKeyJwk) {
  const sharedKey = await deriveSharedKey(privateKeyJwk, senderPublicKeyJwk);
  const encBytes = base64ToBuf(ciphertext);
  const ivBytes = base64ToBuf(iv);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, sharedKey, encBytes);
  return new TextDecoder().decode(decrypted);
}

// 获取或创建本地密钥对
export async function getOrCreateKeyPair(username) {
  const stored = localStorage.getItem(`stgblog_keys_${username}`);
  if (stored) return JSON.parse(stored);
  const keyPair = await generateKeyPair();
  localStorage.setItem(`stgblog_keys_${username}`, JSON.stringify(keyPair));
  return keyPair;
}

// ─── 云端密钥备份（用密码包裹私钥，实现多设备同步 & 清缓存恢复）───

// 从用户名+密码派生包裹密钥
async function deriveWrappingKey(username, password) {
  // 盐 = SHA-256("stgblog:v1:" + username) 前 16 字节（无需服务端随机盐列）
  const saltRaw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stgblog:v1:${username}`));
  const salt = saltRaw.slice(0, 16);
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 生成可上传的云端备份 blob："v1.<iv b64>.<ciphertext b64>，失败返回 null
export async function createKeyBackup(username, password, privateKeyJwk) {
  try {
    const wrapKey = await deriveWrappingKey(username, password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, data);
    const ivB64 = bufToBase64(iv);
    const ctB64 = bufToBase64(ct);
    return `v1.${ivB64}.${ctB64}`;
  } catch (e) {
    console.warn("createKeyBackup failed:", e);
    return null;
  }
}

// 从云端备份 blob 恢复私钥，失败返回 null
export async function restoreKeyBackup(username, password, blob) {
  try {
    if (!blob || typeof blob !== 'string') return null;
    const parts = blob.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    const iv = base64ToBuf(parts[1]);
    const ct = base64ToBuf(parts[2]);
    const wrapKey = await deriveWrappingKey(username, password);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch (e) {
    console.warn("restoreKeyBackup failed:", e);
    return null;
  }
}

// 解析 users.pubkey 字段：兼容旧格式（纯 JWK）与新格式 { pub, encPriv }
export function parsePubkeyRecord(pubkeyStr) {
  if (!pubkeyStr) return null;
  try {
    const obj = JSON.parse(pubkeyStr);
    if (obj && obj.pub && obj.pub.kty) return obj;      // 新格式
    if (obj && obj.kty) return { pub: obj };            // 旧格式（纯 JWK）
    if (obj && typeof obj.pub === 'string') {           // 保险：pub 为字符串
      return { pub: JSON.parse(obj.pub), encPriv: obj.encPriv || null };
    }
    return null;
  } catch {
    return null;
  }
}

// 计算公钥可读指纹（SHA-256 前 12 字节转 hex，每段 4 位分组展示）
export async function pubkeyFingerprint(jwk) {
  if (!jwk?.x || !jwk?.y) return null;
  try {
    const raw = new TextEncoder().encode(jwk.x + jwk.y);
    const hash = await crypto.subtle.digest('SHA-256', raw);
    const bytes = new Uint8Array(hash.slice(0, 8));
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hex.replace(/(.{4})/g, '$1 ').trim();
  } catch { return null; }
}
