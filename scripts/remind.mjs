// Gửi danh sách việc farm hôm nay về Telegram.
// Chạy: TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy node scripts/remind.mjs
// Thêm DRY_RUN=1 để chỉ in ra màn hình, không gửi.
import { readFile } from "node:fs/promises";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DRY = process.env.DRY_RUN === "1";
const SITE = process.env.SITE_URL || "";

const PRIO_ICON = { high: "🔴", mid: "🟡", low: "⚪" };
const PRIO_ORDER = { high: 0, mid: 1, low: 2 };

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const raw = await readFile(new URL("../airdrops.json", import.meta.url), "utf8");
const { airdrops = [] } = JSON.parse(raw);

const today = new Date().toLocaleDateString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "numeric", month: "numeric", year: "numeric",
});

const farming = airdrops
  .filter((a) => (a.status || "farm") === "farm" && (a.daily || []).length)
  .sort((a, b) => (PRIO_ORDER[a.prio] ?? 1) - (PRIO_ORDER[b.prio] ?? 1));
const claimable = airdrops.filter((a) => a.status === "claim");

let msg = `🪂 <b>Việc farm hôm nay</b> — ${esc(today)}\n`;
if (claimable.length) {
  msg += `\n🎁 <b>Có thể claim:</b> ${claimable.map((a) => esc(a.name)).join(", ")}\n`;
}
if (!farming.length) {
  msg += "\nKhông có việc hằng ngày nào. Thêm kèo vào airdrops.json nhé.";
} else {
  for (const a of farming) {
    msg += `\n${PRIO_ICON[a.prio] || "🟡"} <b>${esc(a.name)}</b>${a.chain ? ` · ${esc(a.chain)}` : ""}\n`;
    for (const t of a.daily) msg += `   ☐ ${esc(t)}\n`;
  }
  const total = farming.reduce((n, a) => n + a.daily.length, 0);
  msg += `\nTổng: ${total} việc / ${farming.length} kèo`;
}
if (SITE) msg += `\n👉 Tick việc: ${esc(SITE)}`;
msg += `\n\n⚠️ Không bao giờ nhập seed phrase vào link "claim" lạ.`;

if (DRY || !TOKEN || !CHAT_ID) {
  if (!DRY) console.warn("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID — chỉ in ra màn hình.\n");
  console.log(msg);
  process.exit(DRY ? 0 : (TOKEN && CHAT_ID ? 0 : 1));
}

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "HTML", disable_web_page_preview: true }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.ok) {
  console.error("Gửi Telegram thất bại:", res.status, body.description || "");
  process.exit(1);
}
console.log("Đã gửi nhắc việc lên Telegram ✅");
