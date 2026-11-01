// Tool farm Arc Testnet — mỗi lần chạy làm 2–4 giao dịch nhỏ, ngẫu nhiên, có nghỉ giữa chừng.
// Gas trên Arc trả bằng USDC testnet (miễn phí ở faucet.circle.com).
import { ethers } from "ethers";
import { runApp, randInt, randFloat, sleep, shuffle, shortAddr } from "../common.mjs";
import { CHAINS } from "../chains.mjs";
import meta from "./tool.json" with { type: "json" };

const chain = CHAINS.arc;
const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
];
// Contract siêu nhỏ: gọi gì cũng trả về 42 — để có giao dịch "deploy contract"
const TINY_CONTRACT = "0x600a600c600039600a6000f3602a60005260206000f3";

async function farm(ctx) {
  const n = (k, d) => Number(ctx.setting(k, d));
  const cfg = { minActions: n("minActions", 2), maxActions: n("maxActions", 4), minDelay: n("minDelay", 30), maxDelay: n("maxDelay", 240), minBalance: n("minBalance", 1) };
  if (process.env.LTFARM_FAST) { cfg.minDelay = 1; cfg.maxDelay = 2; }

  const provider = ctx.provider();
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== chain.chainId) throw new Error(`Sai mạng: RPC trả về chainId ${net.chainId}, cần ${chain.chainId}`);
  const wallet = ctx.wallet();
  const me = wallet.address;
  const usdc = new ethers.Contract(chain.tokens.USDC.address, ERC20, wallet);
  const eurc = new ethers.Contract(chain.tokens.EURC.address, ERC20, wallet);

  const nativeBal = Number(ethers.formatUnits(await provider.getBalance(me), chain.nativeDecimals));
  let eurcBal = 0; try { eurcBal = Number(ethers.formatUnits(await eurc.balanceOf(me), 6)); } catch {}
  ctx.log("start", { wallet: shortAddr(me), usdc: nativeBal, eurc: eurcBal, dry: ctx.dry });
  if (nativeBal < cfg.minBalance) {
    const msg = `Hết USDC testnet (${nativeBal}). Xin thêm tại ${chain.faucet} cho ví ${me}`;
    await ctx.telegram(`⚠️ <b>Arc</b>: ${msg}`);
    return { ok: false, txCount: 0, actions: [], error: msg };
  }

  const st = ctx.state(); const deployed = st.deployed || [];
  const actions = {
    nativeSelf: { label: "gửi USDC cho chính mình", run: () => wallet.sendTransaction({ to: me, value: ethers.parseUnits(randFloat(0.001, 0.02).toFixed(4), 18) }) },
    usdcErc20Self: { label: "chuyển USDC (ERC-20)", run: () => usdc.transfer(me, ethers.parseUnits(randFloat(0.01, 0.2).toFixed(4), 6)) },
    usdcApprove: { label: "approve USDC", run: () => usdc.approve(chain.tokens.EURC.address, ethers.parseUnits(randFloat(0.1, 1).toFixed(2), 6)) },
    eurcSelf: { label: "chuyển EURC", enabled: eurcBal > 0.05, run: () => eurc.transfer(me, ethers.parseUnits(randFloat(0.01, Math.min(0.5, eurcBal / 2)).toFixed(4), 6)) },
    deploy: { label: "deploy contract", enabled: Math.random() < 0.2, run: () => wallet.sendTransaction({ data: TINY_CONTRACT }) },
    pokeContract: { label: "gọi contract", enabled: deployed.length > 0, run: () => wallet.sendTransaction({ to: deployed[randInt(0, deployed.length - 1)], data: "0x" + randInt(1, 2 ** 31).toString(16).padStart(8, "0") }) },
  };
  const weights = ["nativeSelf", "nativeSelf", "usdcErc20Self", "usdcErc20Self", "usdcApprove", "eurcSelf", "eurcSelf", "deploy", "pokeContract"];
  const pool = weights.filter((k) => actions[k].enabled !== false);
  const count = randInt(cfg.minActions, cfg.maxActions);
  const plan = [];
  for (const k of shuffle(pool)) { if (plan.length >= count) break; if (!plan.includes(k) || k === "nativeSelf" || k === "usdcErc20Self") plan.push(k); }
  ctx.log("plan", { actions: plan });
  if (ctx.dry) { console.log("Kế hoạch:", plan.map((k) => actions[k].label).join(", ")); return { ok: true, txCount: 0, actions: plan.map((type) => ({ type, ok: true })) }; }

  const done = []; let ok = true, error;
  for (let i = 0; i < plan.length; i++) {
    const k = plan[i];
    try {
      let tx;
      try { tx = await actions[k].run(); }
      catch (e1) { ctx.log("tx_retry", { type: k, error: String(e1.shortMessage || e1.message).slice(0, 120) }); await sleep(8000); tx = await actions[k].run(); }
      const rc = await tx.wait(1, 120_000);
      if (k === "deploy" && rc?.contractAddress) st.deployed = [...deployed, rc.contractAddress].slice(-20);
      done.push({ type: k, ok: rc?.status === 1 });
      ctx.log("tx", { type: k, hash: tx.hash, status: rc?.status });
      console.log(`  ✓ ${actions[k].label}  ${chain.explorer}/tx/${tx.hash}`);
    } catch (e) {
      ok = false; error = String(e.shortMessage || e.message || e).slice(0, 200);
      done.push({ type: k, ok: false }); ctx.log("tx_error", { type: k, error }); break;
    }
    if (i < plan.length - 1) { const w = randInt(cfg.minDelay, cfg.maxDelay); console.log(`  … nghỉ ${w}s`); await sleep(w * 1000); }
  }
  const s2 = ctx.state(); s2.deployed = st.deployed || deployed; ctx.saveState(s2);
  return { ok, txCount: done.filter((d) => d.ok).length, actions: done, ...(error ? { error } : {}) };
}

async function status(ctx, address) {
  try {
    const c = new ethers.Contract(chain.tokens.EURC.address, ERC20, ctx.provider());
    console.log(`EURC: ${Number(ethers.formatUnits(await c.balanceOf(address), 6))}`);
  } catch {}
}

await runApp({ ...meta, chain, farm, status });
