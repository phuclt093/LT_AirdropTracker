// Airdrop Tracker — đồng bộ tiến độ theo ví MetaMask (Cloudflare Worker + KV).
//
// Đăng nhập = ký 1 tin nhắn văn bản (personal_sign): KHÔNG chuyển tiền, KHÔNG tốn gas.
// Worker chỉ kiểm tra chữ ký đúng là của ví đó, rồi cấp token 30 ngày.
// Dữ liệu lưu: đúng file JSON tiến độ mà web vẫn lưu trên trình duyệt (không có private key).
//
//   GET  /nonce                → { nonce }
//   POST /login  {address, message, signature} → { token, address }
//   GET  /state  (Bearer)      → { state, updatedAt } | { state: null }
//   PUT  /state  (Bearer) {state, updatedAt} → { ok, updatedAt }
import { verifyMessage, getAddress } from "viem";

const NONCE_TTL = 10 * 60 * 1000;        // 10 phút để ký
const TOKEN_TTL = 30 * 24 * 3600 * 1000; // đăng nhập giữ 30 ngày
const MAX_BYTES = 200 * 1024;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (s) => b64u(enc.encode(s));
const unb64uText = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

/** Tin nhắn hiển thị trong MetaMask — web và worker phải tạo giống hệt nhau. */
export function loginMessage(host, address, nonce, issuedAt) {
  return `${host} muốn bạn đăng nhập Airdrop Tracker bằng ví:\n${address}\n\n` +
    `Chữ ký này chỉ để xác nhận bạn là chủ ví.\nKHÔNG chuyển tiền, KHÔNG tốn gas.\n\n` +
    `Mã: ${nonce}\nThời gian: ${issuedAt}`;
}

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (h, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });

async function readToken(env, req) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer ([\w-]+)\.([\w-]+)$/);
  if (!m) return null;
  if (!safeEq(await hmac(env.SECRET, "t." + m[1]), m[2])) return null;
  try {
    const p = JSON.parse(unb64uText(m[1]));
    return p.e > Date.now() ? p.a : null;
  } catch { return null; }
}

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (!env.SECRET || env.SECRET.length < 32) return json(h, { error: "Worker chưa có SECRET (wrangler secret put SECRET)" }, 500);
    const url = new URL(req.url);

    try {
      if (url.pathname === "/nonce" && req.method === "GET") {
        const raw = Date.now() + "." + crypto.randomUUID().replace(/-/g, "");
        return json(h, { nonce: raw + "." + (await hmac(env.SECRET, "n." + raw)) });
      }

      if (url.pathname === "/login" && req.method === "POST") {
        const { address, message, signature } = await req.json();
        let addr;
        try { addr = getAddress(address); } catch { return json(h, { error: "Địa chỉ ví không hợp lệ" }, 400); }
        if (typeof message !== "string" || message.length > 1000) return json(h, { error: "Tin nhắn không hợp lệ" }, 400);
        const nonce = (message.match(/^Mã: (\S+)$/m) || [])[1] || "";
        const [ts, rand, sig] = nonce.split(".");
        if (!ts || !rand || !sig || !safeEq(await hmac(env.SECRET, `n.${ts}.${rand}`), sig)) return json(h, { error: "Mã đăng nhập không hợp lệ" }, 400);
        if (Date.now() - Number(ts) > NONCE_TTL) return json(h, { error: "Mã đăng nhập đã hết hạn, thử lại" }, 400);
        // Tin nhắn phải đúng mẫu, đúng ví, đúng tên miền web được phép
        const issuedAt = (message.match(/^Thời gian: (.+)$/m) || [])[1] || "";
        const hosts = (env.ALLOWED_ORIGINS || "").split(",").map((o) => { try { return new URL(o.trim()).host; } catch { return ""; } });
        const okMsg = hosts.some((host) => host && message === loginMessage(host, addr.toLowerCase(), nonce, issuedAt));
        if (!okMsg) return json(h, { error: "Tin nhắn đăng nhập không đúng mẫu" }, 400);
        const valid = await verifyMessage({ address: addr, message, signature });
        if (!valid) return json(h, { error: "Chữ ký không đúng với ví" }, 401);
        const payload = b64uText(JSON.stringify({ a: addr.toLowerCase(), e: Date.now() + TOKEN_TTL }));
        return json(h, { token: payload + "." + (await hmac(env.SECRET, "t." + payload)), address: addr });
      }

      if (url.pathname === "/state") {
        const who = await readToken(env, req);
        if (!who) return json(h, { error: "Chưa đăng nhập hoặc phiên đã hết hạn" }, 401);
        const key = "state:" + who;
        if (req.method === "GET") {
          const v = await env.SYNC.get(key, "json");
          return json(h, v || { state: null, updatedAt: 0 });
        }
        if (req.method === "PUT") {
          const text = await req.text();
          if (text.length > MAX_BYTES) return json(h, { error: "Dữ liệu quá lớn" }, 413);
          const body = JSON.parse(text);
          if (!body || typeof body.state !== "object" || !Array.isArray(body.state.items)) return json(h, { error: "Dữ liệu không hợp lệ" }, 400);
          const updatedAt = Number(body.updatedAt) || Date.now();
          await env.SYNC.put(key, JSON.stringify({ state: body.state, updatedAt }));
          return json(h, { ok: true, updatedAt });
        }
      }

      if (url.pathname === "/" ) return json(h, { ok: true, service: "airdrop-tracker-sync" });
      return json(h, { error: "Không tìm thấy" }, 404);
    } catch (e) {
      return json(h, { error: "Lỗi máy chủ: " + (e.message || e) }, 500);
    }
  },
};
