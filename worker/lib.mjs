import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ethers } from "ethers";

export const WORKER_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = join(WORKER_DIR, "..");
export const DATA_DIR = join(REPO_DIR, "data");
export const LOG_DIR = join(WORKER_DIR, "logs");

export const DRY = process.env.DRY_RUN === "1";

export const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const randFloat = (a, b) => a + Math.random() * (b - a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
export const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD */
export function todayVN(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}
export function writeJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

export function log(kind, obj) {
  const line = JSON.stringify({ t: new Date().toISOString(), kind, ...obj });
  console.log(line);
  try { mkdirSync(LOG_DIR, { recursive: true }); appendFileSync(join(LOG_DIR, `${todayVN()}.jsonl`), line + "\n"); } catch {}
}

/** Ví farm từ PRIVATE_KEY trong .env. Không bao giờ in key ra. */
export function loadWallet(provider) {
  const pk = (process.env.PRIVATE_KEY || "").trim();
  if (!pk) throw new Error("Chưa có PRIVATE_KEY trong worker/.env");
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("PRIVATE_KEY sai định dạng (phải là 0x + 64 ký tự hex)");
  return new ethers.Wallet(pk, provider);
}

/** Địa chỉ công khai để theo dõi (lấy từ PRIVATE_KEY, hoặc WATCH_ADDRESS nếu chỉ muốn xem). */
export function watchAddress() {
  const w = (process.env.WATCH_ADDRESS || "").trim();
  if (w) return ethers.getAddress(w);
  const pk = (process.env.PRIVATE_KEY || "").trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(pk)) return new ethers.Wallet(pk).address;
  return null;
}

export async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat || DRY) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) { log("telegram_error", { error: String(e.message || e) }); }
}

/** Commit + push riêng thư mục data/ (chỉ khi có thay đổi). */
export function pushData(message) {
  if (DRY || process.env.NO_PUSH === "1") { log("push_skipped", { reason: DRY ? "dry_run" : "NO_PUSH" }); return false; }
  const git = (...args) => execFileSync("git", ["-C", REPO_DIR, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("add", "data");
    const changed = git("diff", "--cached", "--name-only", "--", "data");
    if (!changed) { log("push_skipped", { reason: "no_change" }); return false; }
    git("commit", "-m", message, "--", "data");
    git("pull", "--rebase", "--autostash");
    git("push");
    log("pushed", { files: changed.split("\n") });
    return true;
  } catch (e) {
    log("push_error", { error: String(e.stderr || e.message || e).slice(0, 500) });
    return false;
  }
}

export function lockOrExit(name) {
  const f = join(WORKER_DIR, "state", `${name}.lock`);
  mkdirSync(dirname(f), { recursive: true });
  if (existsSync(f)) {
    const age = Date.now() - Number(readFileSync(f, "utf8") || 0);
    if (age < 2 * 3600e3) { console.log(`Đang có tiến trình ${name} khác chạy — bỏ qua.`); process.exit(0); }
  }
  writeFileSync(f, String(Date.now()));
  const release = () => { try { writeFileSync(f, ""); execFileSync("rm", ["-f", f]); } catch {} };
  process.on("exit", release);
  return release;
}
