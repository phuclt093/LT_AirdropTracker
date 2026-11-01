// Farm Arc Testnet cho 1 ví: mỗi lần chạy làm vài giao dịch nhỏ, ngẫu nhiên, có nghỉ giữa chừng.
// Gas trên Arc trả bằng USDC testnet (lấy miễn phí ở faucet.circle.com).
//   DRY_RUN=1  → chỉ kiểm tra + in kế hoạch, không gửi giao dịch nào.
//   FORCE=1    → không áp dụng SKIP_CHANCE (luôn chạy).
import { ethers } from "ethers";
import { join } from "node:path";
import { CHAINS } from "./chains.mjs";
import {
  DATA_DIR, WORKER_DIR, DRY, num, randInt, randFloat, sleep, shuffle, shortAddr, todayVN,
  readJson, writeJson, log, loadWallet, telegram, lockOrExit, pushData,
} from "./lib.mjs";
import { updateStats } from "./stats.mjs";

const chain = CHAINS.arc;
const RUNS_FILE = join(DATA_DIR, "runs.json");
const STATE_FILE = join(process.env.AIRDROP_STATE_DIR || join(WORKER_DIR, "state"), "arc.json");
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];
// Contract siêu nhỏ: gọi gì cũng trả về 42. Dùng để có giao dịch "deploy contract".
const TINY_CONTRACT = "0x600a600c600039600a6000f3602a60005260206000f3";

const cfg = {
  minActions: num(process.env.ARC_MIN_ACTIONS, 2),
  maxActions: num(process.env.ARC_MAX_ACTIONS, 4),
  minDelay: num(process.env.ARC_MIN_DELAY, 30),
  maxDelay: num(process.env.ARC_MAX_DELAY, 240),
  skipChance: num(process.env.SKIP_CHANCE, 0.1),
  minBalance: num(process.env.ARC_MIN_BALANCE, 1),
};

function recordRun(entry) {
  const runs = readJson(RUNS_FILE, {});
  const r = runs.arc || { history: [] };
  r.last = entry;
  r.history = [...(r.history || []), { date: todayVN(), ok: entry.ok, tx: entry.txCount, skipped: !!entry.skipped }].slice(-30);
  runs.arc = r;
  if (!DRY) writeJson(RUNS_FILE, runs);
}

/** Cập nhật stats + đẩy data/ (runs.json, stats.json) lên GitHub một lần. */
async function finish(label, sent = 0) {
  if (DRY) return;
  try { await updateStats({ push: false, justSent: { arc: sent } }); } catch (e) { log("stats_error", { error: String(e.message || e) }); }
  pushData(`farm arc: ${label} ${todayVN()}`);
}

async function main() {
  lockOrExit("farm-arc");
  if (!DRY && process.env.FORCE !== "1" && Math.random() < cfg.skipChance) {
    log("skip_day", { chain: "arc", reason: "SKIP_CHANCE" });
    recordRun({ at: new Date().toISOString(), ok: true, skipped: true, txCount: 0, actions: [] });
    await finish("nghỉ hôm nay");
    return;
  }

  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true });
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== chain.chainId) throw new Error(`Sai mạng: RPC trả về chainId ${net.chainId}, cần ${chain.chainId}`);

  const wallet = loadWallet(provider);
  const me = wallet.address;
  const usdc = new ethers.Contract(chain.tokens.USDC.address, ERC20, wallet);
  const eurc = new ethers.Contract(chain.tokens.EURC.address, ERC20, wallet);

  const nativeBal = Number(ethers.formatUnits(await provider.getBalance(me), chain.nativeDecimals));
  let eurcBal = 0;
  try { eurcBal = Number(ethers.formatUnits(await eurc.balanceOf(me), 6)); } catch {}
  log("start", { chain: "arc", wallet: shortAddr(me), usdc: nativeBal, eurc: eurcBal, dry: DRY });

  if (nativeBal < cfg.minBalance) {
    const msg = `Số dư USDC (${nativeBal}) dưới mức tối thiểu ${cfg.minBalance}. Vào ${chain.faucet} xin thêm cho ví ${me}.`;
    log("low_balance", { balance: nativeBal });
    recordRun({ at: new Date().toISOString(), ok: false, txCount: 0, actions: [], error: "Hết USDC testnet — cần xin faucet" });
    await telegram(`⚠️ <b>Arc</b>: ${msg}`);
    await finish("hết USDC");
    return;
  }

  const state = readJson(STATE_FILE, { deployed: [] });

  // Danh sách hành động có thể làm (trọng số = số lần xuất hiện)
  const actions = {
    nativeSelf: {
      label: "Gửi USDC (native) cho chính mình",
      run: async () => wallet.sendTransaction({ to: me, value: ethers.parseUnits(randFloat(0.001, 0.02).toFixed(4), 18) }),
    },
    usdcErc20Self: {
      label: "Chuyển USDC (ERC-20) cho chính mình",
      run: async () => usdc.transfer(me, ethers.parseUnits(randFloat(0.01, 0.2).toFixed(4), 6)),
    },
    usdcApprove: {
      label: "Approve USDC",
      run: async () => usdc.approve(chain.tokens.EURC.address, ethers.parseUnits(randFloat(0.1, 1).toFixed(2), 6)),
    },
    eurcSelf: {
      label: "Chuyển EURC cho chính mình",
      enabled: eurcBal > 0.05,
      run: async () => eurc.transfer(me, ethers.parseUnits(randFloat(0.01, Math.min(0.5, eurcBal / 2)).toFixed(4), 6)),
    },
    deploy: {
      label: "Deploy contract nhỏ",
      enabled: Math.random() < 0.2, // ~20% số lần chạy
      run: async () => {
        const tx = await wallet.sendTransaction({ data: TINY_CONTRACT });
        tx._afterMine = (rc) => { if (rc?.contractAddress) state.deployed = [...state.deployed, rc.contractAddress].slice(-20); };
        return tx;
      },
    },
    pokeContract: {
      label: "Gọi contract đã deploy",
      enabled: state.deployed.length > 0,
      run: async () => wallet.sendTransaction({ to: state.deployed[randInt(0, state.deployed.length - 1)], data: "0x" + randInt(1, 2 ** 31).toString(16).padStart(8, "0") }),
    },
  };
  const weights = ["nativeSelf", "nativeSelf", "usdcErc20Self", "usdcErc20Self", "usdcApprove", "eurcSelf", "eurcSelf", "deploy", "pokeContract"];
  const pool = weights.filter((k) => actions[k].enabled !== false);
  const count = randInt(cfg.minActions, cfg.maxActions);
  const plan = [];
  for (const k of shuffle(pool)) { if (plan.length >= count) break; if (!plan.includes(k) || k === "nativeSelf" || k === "usdcErc20Self") plan.push(k); }

  log("plan", { actions: plan });
  if (DRY) { console.log("\nDRY_RUN: không gửi giao dịch. Kế hoạch:", plan.map((k) => actions[k].label)); return; }

  const done = [];
  let ok = true, error = null;
  for (let i = 0; i < plan.length; i++) {
    const k = plan[i];
    try {
      let tx;
      try { tx = await actions[k].run(); }
      catch (e1) { log("tx_retry", { type: k, error: String(e1.shortMessage || e1.message).slice(0, 120) }); await sleep(8000); tx = await actions[k].run(); }
      const rc = await tx.wait(1, 120_000);
      tx._afterMine?.(rc);
      done.push({ type: k, hash: tx.hash, ok: rc?.status === 1 });
      log("tx", { type: k, hash: tx.hash, status: rc?.status });
    } catch (e) {
      ok = false; error = String(e.shortMessage || e.message || e).slice(0, 200);
      done.push({ type: k, ok: false });
      log("tx_error", { type: k, error });
      break; // lỗi thì dừng, lần sau chạy tiếp
    }
    if (i < plan.length - 1) {
      const wait = randInt(cfg.minDelay, cfg.maxDelay);
      log("sleep", { seconds: wait });
      await sleep(wait * 1000);
    }
  }

  writeJson(STATE_FILE, state);
  const txCount = done.filter((d) => d.ok).length;
  recordRun({ at: new Date().toISOString(), ok, txCount, actions: done.map(({ type, ok }) => ({ type, ok })), ...(error ? { error } : {}) });

  await finish(ok ? `${txCount} tx` : "lỗi", txCount);

  await telegram(ok
    ? `✅ <b>Arc</b>: xong ${txCount} giao dịch (${done.map((d) => actions[d.type].label).join(", ")})`
    : `❌ <b>Arc</b>: lỗi sau ${txCount} giao dịch — ${error}`);
}

main().catch(async (e) => {
  const error = String(e.shortMessage || e.message || e).slice(0, 200);
  log("fatal", { error });
  recordRun({ at: new Date().toISOString(), ok: false, txCount: 0, actions: [], error });
  await finish("lỗi");
  await telegram(`❌ <b>Arc</b>: ${error}`);
  process.exit(1);
});
