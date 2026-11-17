// 私信图片「阅后即焚」的本地缓存层。
// 接收方查看图片后，把 data URL 写入浏览器 IndexedDB，再把云端 dm_messages.image_data 清空。
// 之后即使云端图片已删除，仍能从本地看到；换设备则看不到（符合阅后即焚预期）。

const DB_NAME = "stgblog_chat_images";
const STORE = "images";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB 不可用")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("打开缓存失败"));
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error || new Error("缓存操作失败"));
    t.onabort = () => reject(t.error || new Error("缓存操作被中止"));
  });
}

export async function cacheChatImage(id, dataUrl) {
  if (!id || !dataUrl) return false;
  try {
    const db = await openDB();
    await tx(db, "readwrite", (s) => s.put({ id: String(id), dataUrl, cachedAt: Date.now() }));
    db.close();
    return true;
  } catch { return false; }
}

export async function getChatImage(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    const req = await tx(db, "readonly", (s) => s.get(String(id)));
    db.close();
    return req?.dataUrl || null;
  } catch { return null; }
}

export async function deleteChatImage(id) {
  if (!id) return false;
  try {
    const db = await openDB();
    await tx(db, "readwrite", (s) => s.delete(String(id)));
    db.close();
    return true;
  } catch { return false; }
}
