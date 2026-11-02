// Tool farm GIWA Sepolia — mỗi lần chạy làm 2–4 giao dịch nhỏ, ngẫu nhiên, có nghỉ giữa chừng.
// Gas là ETH testnet, xin miễn phí ở faucet.giwa.io (0.005 ETH / 24h). Tool KHÔNG tự xin faucet.
import { ethers } from "ethers";
import { runApp, randInt, randFloat, sleep, shuffle, shortAddr } from "../common.mjs";
import { CHAINS } from "../chains.mjs";
import meta from "./tool.json" with { type: "json" };

const chain = CHAINS.giwa;
const WETH_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function deposit() payable",
  "function withdraw(uint256)",
];
// Contract siêu nhỏ: gọi gì cũng trả về 42 — để có giao dịch "deploy contract"
const TINY_CONTRACT = "0x600a600c600039600a6000f3602a60005260206000f3";
const eth = (x) => ethers.parseEther(x.toFixed(6));

async function farm(ctx) {
  const n = (k, d) => Number(ctx.setting(k, d));
  const cfg = { minActions: n("minActions", 2), maxActions: n("maxActions", 4), minDelay: n("minDelay", 30), maxDelay: n("maxDelay", 240), minBalance: n("minBalance", chain.minBalance) };
  if (process.env.LTFARM_FAST) { cfg.minDelay = 1; cfg.maxDelay = 2; }

  const provider = ctx.provider();
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== chain.chainId) throw new Error(`Sai mạng: RPC trả về chainId ${net.chainId}, cần ${chain.chainId}`);
  const wallet = ctx.wallet();
  const me = wallet.address;
  const weth = new ethers.Contract(chain.weth, WETH_ABI, wallet);

  const bal = Number(ethers.formatEther(await provider.getBalance(me)));
  let wethBal = 0; try { wethBal = Number(ethers.formatEther(await weth.balanceOf(me))); } catch {}
  ctx.log("start", { wallet: shortAddr(me), eth: bal, weth: wethBal, dry: ctx.dry });
  if (bal < cfg.minBalance) {
    const msg = `Sắp hết ETH testnet (${bal}). Xin thêm tại ${chain.faucet} cho ví ${me}`;
    await ctx.telegram(`⚠️ <b>GIWA</b>: ${msg}`);
    return { ok: false, txCount: 0, actions: [], error: msg };
  }

  // Số tiền mỗi giao dịch tính theo số dư để không "đốt" hết gas faucet
  const small = Math.min(0.0002, bal / 50);
  const st = ctx.state(); const deployed = st.deployed || [];
  const actions = {
    nativeSelf: { label: "gửi ETH cho chính mình", run: () => wallet.sendTransaction({ to: me, value: eth(randFloat(small / 10, small)) }) },
    wrap: { label: "wrap ETH → WETH", run: () => weth.deposit({ value: eth(randFloat(small / 4, small)) }) },
    unwrap: { label: "unwrap WETH → ETH", enabled: wethBal > 0.000002, run: () => weth.withdraw(eth(randFloat(wethBal / 4, wethBal / 2))) },
    deploy: { label: "deploy contract", enabled: Math.random() < 0.2, run: () => wallet.sendTransaction({ data: TINY_CONTRACT }) },
    pokeContract: { label: "gọi contract", enabled: deployed.length > 0, run: () => wallet.sendTransaction({ to: deployed[randInt(0, deployed.length - 1)], data: "0x" + randInt(1, 2 ** 31).toString(16).padStart(8, "0") }) },
  };
  const weights = ["nativeSelf", "nativeSelf", "wrap", "wrap", "unwrap", "unwrap", "deploy", "pokeContract"];
  const pool = weights.filter((k) => actions[k].enabled !== false);
  const count = randInt(cfg.minActions, cfg.maxActions);
  const plan = [];
  for (const k of shuffle(pool)) { if (plan.length >= count) break; if (!plan.includes(k) || k === "nativeSelf" || k === "wrap") plan.push(k); }
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

async function extra(ctx, address) {
  const c = new ethers.Contract(chain.weth, WETH_ABI, ctx.provider());
  return [{ label: "WETH", value: Number(Number(ethers.formatEther(await c.balanceOf(address))).toFixed(6)) }];
}

await runApp({ ...meta, chain, farm, extra });
