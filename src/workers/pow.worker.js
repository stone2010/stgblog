// STGBLOG v13 · 真人认证计算 Worker
// 产出的是「服务端可复验的反垃圾凭证」(Hashcash 风格 SHA-256 stamp)，不是空转烧电：
//   hash = SHA256(seed + ":" + round + ":" + nonce)，要求 hex 前 4 位为 0。
// 主线程每 30 秒把这批凭证交给 Postgres 复验并结算在线计算时长；
// 未被消费的凭证还能兑换 1 次额外发帖 / 评论额度。
// 独立 Worker 保证计算不会卡住页面交互。

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));
const enc = new TextEncoder();

function sha256Hex(text) {
  const src = enc.encode(text);
  const bitLen = src.length * 8;
  const total = Math.ceil((src.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(src);
  buf[src.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  const H = H0.slice();
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, "0");
  return out;
}

let running = false;
let loopActive = false;   // 保证全局只有一个 workSlice 循环
let seed = "";
let zeros = 4;
let round = 0;
let stamps = [];
let computed = 0;
let target = "0000";

// 每 400ms 让出一次事件循环，保证 stop / 新任务消息能被及时接收
function workSlice() {
  if (!running) { loopActive = false; return; }
  const deadline = Date.now() + 400;
  while (running && Date.now() < deadline) {
    const prefix = seed + ":" + round + ":";
    let found = null;
    for (let nonce = 0; nonce < 400000; nonce++) {
      const hex = sha256Hex(prefix + nonce);
      computed++;
      if (hex.startsWith(target)) { found = { round, nonce, hash: hex }; break; }
    }
    if (found) {
      stamps.push(found);
      round++;
    } else {
      round++; // 极端情况下跳过该轮，避免死循环
    }
    if (stamps.length >= 256) flush(false);
  }
  if (stamps.length) flush(false);
  setTimeout(workSlice, 0);
}

function flush(final) {
  const batch = stamps;
  stamps = [];
  if (batch.length || final) {
    self.postMessage({ type: "batch", stamps: batch, computed, final });
  }
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === "start") {
    // 允许「挑战过期 → 换新 seed」时原地重启：只重置状态，不重复起循环。
    running = true; seed = String(m.seed || ""); zeros = Number(m.zeros) || 4;
    target = "0".repeat(Math.max(1, Math.min(8, zeros)));
    round = Number(m.round) || 0; computed = 0; stamps = [];
    self.postMessage({ type: "started", seed });
    if (!loopActive) { loopActive = true; workSlice(); }
  } else if (m.type === "stop") {
    if (!running) return;
    running = false;
    flush(true);
    self.postMessage({ type: "stopped" });
  } else if (m.type === "flush") {
    flush(false);
  }
};
