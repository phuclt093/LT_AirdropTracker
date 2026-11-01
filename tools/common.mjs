// Khung dùng chung cho mọi tool farm của Airdrop Tracker.
// Mỗi tool được đóng gói thành 1 file chạy (Linux / Windows), mở lên là có menu tiếng Việt.
// Mọi dữ liệu (ví, trạng thái, nhật ký) chỉ nằm trên máy người dùng.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import readline from "node:readline";
import { ethers } from "ethers";
import { startGui } from "./gui.mjs";

export const isWin = process.platform === "win32";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const randFloat = (a, b) => a + Math.random() * (b - a);
export const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
export const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
export const todayVN = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
const C = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
export { C };

function readJson(f, fb) { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fb; } }
function writeJson(f, o, secret = false) {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(o, null, 2) + "\n");
  if (secret && !isWin) try { chmodSync(f, 0o600); } catch {}
}

/** Thư mục dữ liệu của tool: Linux ~/.config/ltfarm/<id>, Windows %APPDATA%\LTFarm\<id> */
export function appDir(id) {
  const base = process.env.LTFARM_HOME || (isWin ? join(process.env.APPDATA || join(os.homedir(), "AppData", "Roaming"), "LTFarm") : join(process.env.XDG_CONFIG_HOME || join(os.homedir(), ".config"), "ltfarm"));
  return join(base, id);
}

// ---------- nhập liệu ----------
// Không phải terminal (dữ liệu được dán/pipe vào): đọc theo hàng đợi để không mất dòng nào
let lineRl = null, lineQueue = [], lineWaiters = [], lineClosed = false;
function nextLine() {
  if (!lineRl) {
    lineRl = readline.createInterface({ input: process.stdin });
    lineRl.on("line", (l) => (lineWaiters.length ? lineWaiters.shift()(l) : lineQueue.push(l)));
    lineRl.on("close", () => { lineClosed = true; while (lineWaiters.length) lineWaiters.shift()(""); });
  }
  if (lineQueue.length) return Promise.resolve(lineQueue.shift());
  if (lineClosed) return Promise.resolve("");
  return new Promise((r) => lineWaiters.push(r));
}
function ask(q) {
  if (!process.stdin.isTTY) { process.stdout.write(q); return nextLine().then((a) => { process.stdout.write("\n"); return a.trim(); }); }
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a.trim()); });
  });
}
/** Nhập ẩn (hiện * thay cho ký tự) — dùng cho private key */
function askHidden(q) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) return ask(q);
  return new Promise((res) => {
    process.stdout.write(q);
    let v = "";
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    const on = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", on); process.stdout.write("\n"); return res(v.trim()); }
        if (c === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (c === "\u007f" || c === "\b") { if (v) { v = v.slice(0, -1); process.stdout.write("\b \b"); } continue; }
        v += c; process.stdout.write("*");
      }
    };
    process.stdin.on("data", on);
  });
}
const pause = () => ask(C.d("\nNhấn Enter để quay lại menu…"));

// ---------- lịch chạy tự động ----------
function scheduleName(id) { return `ltfarm-${id}`; }
function exePath() { return process.execPath; } // khi đóng gói = chính file tool

function installSchedule(id, title) {
  const exe = exePath();
  if (isWin) {
    // Mỗi ngày 8h sáng Windows gọi tool với --scheduled; tool tự chờ ngẫu nhiên 0–12 tiếng rồi mới farm
    execFileSync("schtasks", ["/Create", "/F", "/SC", "DAILY", "/ST", "08:00", "/TN", scheduleName(id), "/TR", `"${exe}" --scheduled`], { stdio: "inherit" });
    return "Đã tạo tác vụ trong Task Scheduler: chạy mỗi ngày, giờ ngẫu nhiên 8h–20h (máy cần bật).";
  }
  const unitDir = join(os.homedir(), ".config", "systemd", "user");
  mkdirSync(unitDir, { recursive: true });
  const n = scheduleName(id);
  writeFileSync(join(unitDir, `${n}.service`), `[Unit]\nDescription=${title}\nWants=network-online.target\nAfter=network-online.target\n\n[Service]\nType=oneshot\nExecStart="${exe}" --farm\nTimeoutStartSec=1h\nNice=10\n`);
  writeFileSync(join(unitDir, `${n}.timer`), `[Unit]\nDescription=${title} (lịch)\n\n[Timer]\nOnCalendar=*-*-* 08:00:00 Asia/Ho_Chi_Minh\nRandomizedDelaySec=12h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`);
  execFileSync("systemctl", ["--user", "daemon-reload"]);
  execFileSync("systemctl", ["--user", "enable", "--now", `${n}.timer`]);
  let linger = "";
  try { linger = execFileSync("loginctl", ["show-user", os.userInfo().username, "-p", "Linger", "--value"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
  return "Đã bật lịch systemd: mỗi ngày 1 lần, giờ ngẫu nhiên 8h–20h." +
    (linger === "yes" ? "" : `\n(Tuỳ chọn, không bắt buộc) Tool chạy khi bạn đã đăng nhập vào máy. Muốn chạy cả khi máy bật mà chưa ai đăng nhập: mở Terminal gõ 1 lần  sudo loginctl enable-linger ${os.userInfo().username}`);
}
function removeSchedule(id) {
  const n = scheduleName(id);
  if (isWin) { try { execFileSync("schtasks", ["/Delete", "/F", "/TN", n], { stdio: "inherit" }); } catch {} return "Đã xoá tác vụ trong Task Scheduler."; }
  try { execFileSync("systemctl", ["--user", "disable", "--now", `${n}.timer`]); } catch {}
  const unitDir = join(os.homedir(), ".config", "systemd", "user");
  rmSync(join(unitDir, `${n}.service`), { force: true }); rmSync(join(unitDir, `${n}.timer`), { force: true });
  try { execFileSync("systemctl", ["--user", "daemon-reload"]); } catch {}
  return "Đã tắt lịch chạy tự động.";
}
function scheduleStatus(id) {
  const n = scheduleName(id);
  try {
    if (isWin) { execFileSync("schtasks", ["/Query", "/TN", n], { stdio: "ignore" }); return "đang bật (Task Scheduler)"; }
    const out = execFileSync("systemctl", ["--user", "list-timers", `${n}.timer`, "--no-legend"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out ? "đang bật — lần tới: " + out.split(/\s{2,}/)[0] : "đang tắt";
  } catch { return "đang tắt"; }
}

/**
 * Chạy app. tool = {
 *   id, name, version, chain (từ chains.mjs), mode: "gui" (mặc định, giao diện trình duyệt) | "batch" (menu chữ trong cửa sổ dòng lệnh),
 *   farm(ctx) → { ok, txCount, actions:[{type,ok}], error?, skipped? },
 *   extra(ctx, address) → [{label, value}] số liệu riêng của tool (tuỳ chọn)
 * }
 */
export async function runApp(tool) {
  if (isWin) { try { execFileSync("cmd", ["/c", "chcp 65001 >nul"], { stdio: "ignore" }); } catch {} }
  const dir = appDir(tool.id);
  const CFG = join(dir, "config.json"), STATE = join(dir, "state.json"), LOGS = join(dir, "logs"), LOCK = join(dir, "farm.lock");
  const loadCfg = () => readJson(CFG, { settings: {} });
  const ctx = {
    tool, dir, dry: process.argv.includes("--dry"),
    get cfg() { return loadCfg(); },
    saveCfg: (c) => writeJson(CFG, c, true),
    state: () => readJson(STATE, {}),
    saveState: (s) => writeJson(STATE, s),
    log(kind, obj = {}) {
      const line = JSON.stringify({ t: new Date().toISOString(), kind, ...obj });
      if (!ctx.quiet && (process.env.LTFARM_VERBOSE || !process.stdout.isTTY)) console.log(line);
      try { mkdirSync(LOGS, { recursive: true }); appendFileSync(join(LOGS, `${todayVN()}.jsonl`), line + "\n"); } catch {}
    },
    provider() {
      const rpc = process.env[`${tool.chain.key.toUpperCase()}_RPC`] || tool.chain.rpc;
      // batchMaxCount 1: nhiều RPC testnet không nhận yêu cầu gộp (batch) → gửi từng yêu cầu một
      return new ethers.JsonRpcProvider(rpc, tool.chain.chainId, { staticNetwork: true, batchMaxCount: 1 });
    },
    wallet() {
      const pk = (loadCfg().privateKey || "").trim();
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Chưa cài ví farm — mở tool, chọn mục 1");
      return new ethers.Wallet(pk, ctx.provider());
    },
    async telegram(text) {
      const t = loadCfg().telegram; if (!t?.token || !t?.chat || ctx.dry) return;
      try { await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: t.chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }); } catch {}
    },
    setting: (k, d) => { const v = loadCfg().settings?.[k]; return v === undefined || v === "" ? d : v; },
  };

  async function doFarm({ force = false } = {}) {
    if (existsSync(LOCK)) {
      const [pid, ts] = readFileSync(LOCK, "utf8").split(":").map(Number);
      let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
      if (alive && Date.now() - ts < 2 * 3600e3) { console.log("Đang có lần farm khác chạy — bỏ qua."); return null; }
    }
    mkdirSync(dir, { recursive: true }); writeFileSync(LOCK, `${process.pid}:${Date.now()}`);
    let r;
    try {
      if (!force && !ctx.dry && Math.random() < Number(ctx.setting("skipChance", 0.1))) {
        r = { ok: true, skipped: true, txCount: 0, actions: [] }; ctx.log("skip_day");
      } else r = await tool.farm(ctx);
    } catch (e) {
      r = { ok: false, txCount: 0, actions: [], error: String(e.shortMessage || e.message || e).slice(0, 200) };
      ctx.log("fatal", { error: r.error });
    } finally { rmSync(LOCK, { force: true }); }
    if (!ctx.dry) {
      const s = ctx.state();
      s.last = { at: new Date().toISOString(), ...r };
      s.history = [...(s.history || []), { date: todayVN(), ok: r.ok, tx: r.txCount, skipped: !!r.skipped }].slice(-60);
      ctx.saveState(s);
      if (!r.skipped) await ctx.telegram(r.ok ? `✅ <b>${tool.name}</b>: xong ${r.txCount} giao dịch` : `❌ <b>${tool.name}</b>: ${r.error || "lỗi"}`);
    }
    return r;
  }

  async function showStatus() {
    const cfg = loadCfg(); const s = ctx.state();
    console.log(C.b(`\n📊 ${tool.name} — tình trạng\n`));
    if (!cfg.privateKey) { console.log(C.y("Chưa cài ví farm (mục 1).")); return; }
    const w = new ethers.Wallet(cfg.privateKey);
    console.log(`Ví: ${w.address}`);
    try {
      const p = ctx.provider();
      const [bal, nonce] = await Promise.all([p.getBalance(w.address), p.getTransactionCount(w.address)]);
      const b = Number(ethers.formatUnits(bal, tool.chain.nativeDecimals));
      console.log(`Số dư: ${b} ${tool.chain.nativeSymbol}   ·   Đã gửi: ${nonce} giao dịch`);
      if (b < Number(ctx.setting("minBalance", 1))) console.log(C.y(`⚠️  Sắp hết gas — xin thêm tại ${tool.chain.faucet}`));
      if (tool.extra) for (const x of await tool.extra(ctx, w.address)) console.log(`${x.label}: ${x.value}`);
    } catch (e) { console.log(C.r("Không đọc được số liệu từ mạng: " + (e.shortMessage || e.message))); }
    const days = (s.history || []).filter((h) => h.ok && h.tx > 0).map((h) => h.date);
    console.log(`Số ngày đã farm: ${new Set(days).size}`);
    if (s.last) console.log(`Lần gần nhất: ${s.last.at.replace("T", " ").slice(0, 16)} UTC — ${s.last.skipped ? "nghỉ" : s.last.ok ? C.g(`✅ ${s.last.txCount} giao dịch`) : C.r("❌ " + (s.last.error || "lỗi"))}`);
    console.log(`Chạy tự động: ${scheduleStatus(tool.id)}`);
    console.log(C.d(`Xem ví: ${tool.chain.explorer}/address/${w.address}`));
    console.log(C.d(`Dữ liệu tool: ${dir}`));
  }

  // ---------- chế độ dòng lệnh (dùng cho lịch chạy) ----------
  const argv = process.argv.slice(2);
  if (argv.includes("--version")) { console.log(tool.version); return; }
  if (argv.includes("--status")) { await showStatus(); return; }
  if (argv.includes("--farm") || argv.includes("--scheduled")) {
    if (argv.includes("--scheduled")) { const m = randInt(0, 12 * 60); ctx.log("scheduled_wait", { minutes: m }); await sleep(m * 60e3); }
    const r = await doFarm({ force: argv.includes("--force") });
    process.exit(r && !r.ok ? 1 : 0);
  }

  async function statusData() {
    const cfg = loadCfg(); const s = ctx.state();
    if (!cfg.privateKey) return { address: null };
    const address = new ethers.Wallet(cfg.privateKey).address;
    const p = ctx.provider();
    const [bal, nonce] = await Promise.all([p.getBalance(address), p.getTransactionCount(address)]);
    const balance = Number(Number(ethers.formatUnits(bal, tool.chain.nativeDecimals)).toFixed(4));
    let extra = []; try { extra = tool.extra ? await tool.extra(ctx, address) : []; } catch {}
    const days = new Set((s.history || []).filter((h) => h.ok && h.tx > 0).map((h) => h.date)).size;
    return { address, balance, symbol: tool.chain.nativeSymbol, nonce, days, extra, last: s.last || null, low: balance < Number(ctx.setting("minBalance", 1)) };
  }

  // ---------- Linux: biểu tượng trong danh sách ứng dụng (nháy là mở giao diện) ----------
  if (!isWin && !process.env.LTFARM_HOME && !process.env.LTFARM_NO_DESKTOP) {
    try {
      const appsDir = join(os.homedir(), ".local", "share", "applications");
      const desk = join(appsDir, `ltfarm-${tool.id}.desktop`);
      const want = `[Desktop Entry]\nType=Application\nName=${tool.name}\nComment=Airdrop Tracker — tool farm\nExec="${exePath()}"\nTerminal=${tool.mode === "batch" ? "true" : "false"}\nIcon=${tool.mode === "batch" ? "utilities-terminal" : "applications-internet"}\nCategories=Utility;\n`;
      if ((existsSync(desk) ? readFileSync(desk, "utf8") : "") !== want) { mkdirSync(appsDir, { recursive: true }); writeFileSync(desk, want); try { chmodSync(desk, 0o755); } catch {} }
    } catch {}
  }

  // ---------- mặc định: giao diện đồ hoạ trên trình duyệt (--cli để dùng menu chữ) ----------
  const wantGui = argv.includes("--gui") || (!argv.includes("--cli") && tool.mode !== "batch");
  if (wantGui) {
    ctx.quiet = true; // giao diện chỉ hiện dòng dễ đọc, nhật ký chi tiết vẫn ghi vào thư mục logs
    await startGui({
      tool, isWin,
      info: () => {
        const cfg = loadCfg(); const st = scheduleStatus(tool.id);
        return { platform: isWin ? "Windows" : "Linux", address: cfg.privateKey ? new ethers.Wallet(cfg.privateKey).address : null,
          faucet: tool.chain.faucet, explorer: tool.chain.explorer, dir, schedule: { on: !st.startsWith("đang tắt"), text: st.startsWith("đang tắt") ? "" : "Lịch: " + st } };
      },
      status: async () => {
        try { return await statusData(); }
        catch (e) {
          const msg = e.shortMessage || e.info?.error?.message || e.error?.message || e.message || String(e);
          ctx.log("status_error", { error: String(msg).slice(0, 300), code: e.code });
          throw new Error(/timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network/i.test(msg) ? "Không kết nối được RPC (mạng chậm hoặc bị chặn) — thử lại sau" : String(msg).slice(0, 200));
        }
      },
      setKey: (k) => {
        const pk = k.trim().startsWith("0x") ? k.trim() : "0x" + k.trim();
        if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) return { error: "Key không đúng định dạng (64 ký tự hex). Kiểm tra lại, đừng dán seed phrase 12 từ." };
        writeJson(CFG, { ...loadCfg(), privateKey: pk }, true);
        return { ok: true, address: new ethers.Wallet(pk).address };
      },
      farm: async ({ dry }) => { ctx.dry = dry; try { return (await doFarm({ force: true })) || { ok: false, error: "Đang có lần farm khác chạy" }; } finally { ctx.dry = false; } },
      schedule: (on) => { try { return { ok: true, text: on ? installSchedule(tool.id, tool.name).replace(/\x1b\[[0-9;]*m/g, "") : removeSchedule(tool.id) }; } catch (e) { return { ok: false, error: e.message }; } },
      setTelegram: async (token, chat) => {
        writeJson(CFG, { ...loadCfg(), telegram: token ? { token, chat } : undefined }, true);
        if (!token) return { message: "Đã tắt Telegram" };
        await ctx.telegram(`🔔 ${tool.name} đã kết nối Telegram`); return { message: "Đã lưu — kiểm tra Telegram xem có tin thử chưa" };
      },
      report: ({ kind, text, withLogs }) => {
        // Soạn issue báo lỗi / góp ý — ẩn mọi thứ nhạy cảm trước khi gửi
        const hide = (x) => String(x).replace(/0x[0-9a-fA-F]{64}/g, "0x[ẩn]").replace(/\b[0-9a-fA-F]{64}\b/g, "[ẩn]").replace(/0x([0-9a-fA-F]{4})[0-9a-fA-F]{32}([0-9a-fA-F]{4})/g, "0x$1…$2");
        const s = ctx.state();
        let logs = "";
        if (withLogs) {
          try {
            const files = existsSync(LOGS) ? readdirSync(LOGS).filter((f) => f.endsWith(".jsonl")).sort().slice(-2) : [];
            const lines = files.flatMap((f) => readFileSync(join(LOGS, f), "utf8").trim().split("\n")).slice(-25);
            logs = hide(lines.join("\n")).slice(-3500);
          } catch {}
        }
        const isBug = kind !== "idea";
        const title = `[${isBug ? "Bug" : "Góp ý"}] ${tool.name} v${tool.version}`;
        const body = [
          `### ${isBug ? "Lỗi gặp phải" : "Góp ý"}`, hide(text || "(chưa ghi)"), "",
          "### Thông tin", `- Tool: \`${tool.id}\` v${tool.version} (${tool.mode || "gui"})`, `- Máy: ${isWin ? "Windows" : "Linux"} ${os.release()} · ${process.arch}`,
          s.last ? `- Lần farm gần nhất: ${s.last.at} — ${s.last.skipped ? "nghỉ" : s.last.ok ? "OK " + s.last.txCount + " tx" : "LỖI: " + hide(s.last.error || "")}` : "- Chưa farm lần nào",
          ...(logs ? ["", "<details><summary>Nhật ký gần nhất (đã ẩn ví/key)</summary>", "", "```", logs, "```", "</details>"] : []),
          "", "---", "_Gửi từ app tool. Có ảnh chụp màn hình thì kéo thả vào ô này._",
        ].join("\n");
        const repo = tool.repo || "phuclt093/LT_AirdropTracker";
        return { url: `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&labels=${isBug ? "bug" : "enhancement"}&body=${encodeURIComponent(body)}` };
      },
      setSettings: (b) => { const c = loadCfg(); c.settings = { ...(c.settings || {}), ...b }; writeJson(CFG, c, true); return { ok: true }; },
    });
    return;
  }

  // ---------- menu ----------
  for (;;) {
    const cfg = loadCfg();
    console.clear?.();
    console.log(C.b(`\n🪂 ${tool.name}  v${tool.version}`) + C.d(`   (${isWin ? "Windows" : "Linux"})`));
    console.log(C.d(`Ví farm: ${cfg.privateKey ? shortAddr(new ethers.Wallet(cfg.privateKey).address) : "chưa cài"}   ·   Tự động: ${scheduleStatus(tool.id)}\n`));
    console.log("  1. Cài ví farm (private key)");
    console.log("  2. Kiểm tra kết nối & số dư");
    console.log("  3. Farm ngay bây giờ");
    console.log("  4. Chạy thử (không gửi giao dịch)");
    console.log("  5. Xem tình trạng");
    console.log("  6. Bật chạy tự động mỗi ngày");
    console.log("  7. Tắt chạy tự động");
    console.log("  8. Báo kết quả qua Telegram (tuỳ chọn)");
    console.log("  0. Thoát\n");
    const c = await ask("Chọn: ");
    try {
      if (c === "0" || c === "") return;
      if (c === "1") {
        console.log(C.y("\n⚠️  Chỉ dùng private key của VÍ FARM RIÊNG, không dùng ví chính. Key chỉ lưu trên máy này."));
        const pk0 = await askHidden("Dán private key (sẽ hiện ***): ");
        const pk = pk0.startsWith("0x") ? pk0 : "0x" + pk0;
        if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) { console.log(C.r("Key không đúng định dạng (64 ký tự hex).")); await pause(); continue; }
        const w = new ethers.Wallet(pk);
        writeJson(CFG, { ...cfg, privateKey: pk }, true);
        console.log(C.g(`Đã lưu. Địa chỉ ví farm: ${w.address}`));
        console.log(`Tiếp theo: xin gas tại ${tool.chain.faucet} cho địa chỉ trên, rồi chọn mục 2 để kiểm tra.`);
        await pause();
      } else if (c === "2" || c === "5") { await showStatus(); await pause(); }
      else if (c === "3" || c === "4") {
        ctx.dry = c === "4";
        console.log(ctx.dry ? "\nChạy thử, không gửi giao dịch…" : "\nĐang farm, có thể mất vài phút vì tool nghỉ ngẫu nhiên giữa các giao dịch…");
        process.env.LTFARM_VERBOSE = "1";
        const r = await doFarm({ force: true });
        delete process.env.LTFARM_VERBOSE; ctx.dry = false;
        if (r) console.log(r.ok ? C.g(`\n✅ Xong: ${r.txCount} giao dịch`) : C.r(`\n❌ ${r.error}`));
        await pause();
      } else if (c === "6") {
        if (!cfg.privateKey) { console.log(C.r("Cài ví farm trước (mục 1).")); await pause(); continue; }
        console.log(C.y("\nLưu ý: lịch chạy gọi đúng file tool ở vị trí hiện tại — đừng di chuyển / xoá file này."));
        console.log(installSchedule(tool.id, tool.name)); await pause();
      } else if (c === "7") { console.log(removeSchedule(tool.id)); await pause(); }
      else if (c === "8") {
        console.log("\nTạo bot: chat với @BotFather → /newbot → lấy token. Nhắn 1 tin cho bot, rồi mở\nhttps://api.telegram.org/bot<TOKEN>/getUpdates để lấy chat id. Để trống để tắt.");
        const token = await ask("Bot token: "); const chat = token ? await ask("Chat id: ") : "";
        writeJson(CFG, { ...cfg, telegram: token ? { token, chat } : undefined }, true);
        if (token) { await ctx.telegram(`🔔 ${tool.name} đã kết nối Telegram`); console.log(C.g("Đã lưu — kiểm tra Telegram xem có tin thử chưa.")); } else console.log("Đã tắt Telegram.");
        await pause();
      }
    } catch (e) { console.log(C.r("Lỗi: " + (e.message || e))); await pause(); }
  }
}
