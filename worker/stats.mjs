// Thu thập số liệu on-chain công khai của ví farm → data/stats.json → push lên GitHub.
// Web Airdrop Tracker đọc file này để hiện số dư, số giao dịch, số ngày hoạt động.
// Chỉ đọc dữ liệu công khai, không cần (và không dùng) private key để ký gì cả.
import { ethers } from "ethers";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAINS } from "./chains.mjs";
import { DATA_DIR, readJson, writeJson, todayVN, shortAddr, watchAddress, log, pushData } from "./lib.mjs";

const STATS_FILE = join(DATA_DIR, "stats.json");
const ERC20 = ["function balanceOf(address) view returns (uint256)"];
const KEEP_DAYS = 120;

async function collectChain(chain, address) {
  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true });
  const [bal, nonce] = await Promise.all([provider.getBalance(address), provider.getTransactionCount(address)]);
  const tokens = {};
  for (const [sym, t] of Object.entries(chain.tokens || {})) {
    if (sym === chain.nativeSymbol) continue; // native đã tính ở trên
    try {
      const c = new ethers.Contract(t.address, ERC20, provider);
      tokens[sym] = Number(ethers.formatUnits(await c.balanceOf(address), t.decimals));
    } catch { /* token lỗi thì bỏ qua */ }
  }
  return { balance: Number(ethers.formatUnits(bal, chain.nativeDecimals)), nonce, tokens };
}

function activeDays(history, base) {
  const days = Object.keys(history).sort();
  let n = 0, prev = base ?? null;
  for (const d of days) { if (prev !== null && history[d] > prev) n++; prev = history[d]; }
  return n;
}

export async function updateStats({ push = true, justSent = {} } = {}) {
  const address = watchAddress();
  if (!address) throw new Error("Chưa có PRIVATE_KEY hoặc WATCH_ADDRESS trong worker/.env");
  const label = process.env.WALLET_LABEL || "Ví farm 1";
  const old = readJson(STATS_FILE, { chains: {} });
  const next = { updated: old.updated || null, chains: { ...old.chains } };
  const today = todayVN();

  for (const chain of Object.values(CHAINS)) {
    try {
      const s = await collectChain(chain, address);
      const prevW = (old.chains?.[chain.key]?.wallets || []).find((w) => w.short === shortAddr(address)) || {};
      const history = { ...(prevW.history || {}) };
      // mốc ban đầu: số giao dịch trước lần theo dõi đầu tiên (để ngày đầu vẫn được tính)
      const base = prevW.base ?? Math.max(0, s.nonce - (justSent[chain.key] || 0));
      // ghi nonce đầu tiên của ngày làm mốc nếu chưa có ngày hôm qua
      history[today] = s.nonce;
      for (const d of Object.keys(history).sort().slice(0, -KEEP_DAYS)) delete history[d];
      const w = {
        label, short: shortAddr(address),
        balance: Math.round(s.balance * 1e4) / 1e4,
        tokens: Object.fromEntries(Object.entries(s.tokens).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])),
        nonce: s.nonce,
        activeDays: activeDays(history, base),
        base,
        firstSeen: prevW.firstSeen || today,
        history,
      };
      next.chains[chain.key] = { name: chain.name, explorer: chain.explorer, faucet: chain.faucet, symbol: chain.nativeSymbol, wallets: [w] };
      log("stats", { chain: chain.key, wallet: w.short, nonce: w.nonce, balance: w.balance });
    } catch (e) {
      log("stats_error", { chain: chain.key, error: String(e.shortMessage || e.message || e) });
    }
  }

  const strip = (o) => JSON.stringify({ ...o, updated: null });
  if (strip(old) === strip(next)) { log("stats_unchanged", {}); return { changed: false }; }
  next.updated = new Date().toISOString();
  writeJson(STATS_FILE, next);
  const pushed = push ? pushData(`stats: cập nhật số liệu on-chain ${today}`) : false;
  return { changed: true, pushed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  updateStats().catch((e) => { log("fatal", { error: String(e.message || e) }); process.exit(1); });
}
