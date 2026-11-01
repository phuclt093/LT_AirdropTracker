// Kiểm tra nhanh: .env đúng chưa, RPC có chạy không, ví còn bao nhiêu USDC.
import { ethers } from "ethers";
import { CHAINS } from "./chains.mjs";
import { watchAddress, shortAddr } from "./lib.mjs";

const ok = (m) => console.log("✅ " + m), bad = (m) => console.log("❌ " + m), info = (m) => console.log("   " + m);

const pk = (process.env.PRIVATE_KEY || "").trim();
if (!pk) bad("Chưa có PRIVATE_KEY trong worker/.env");
else if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) bad("PRIVATE_KEY sai định dạng (cần 0x + 64 ký tự hex)");
else ok("PRIVATE_KEY đúng định dạng (không in ra)");

const addr = watchAddress();
if (addr) ok(`Địa chỉ ví farm: ${addr}`);

for (const chain of Object.values(CHAINS)) {
  console.log(`\n— ${chain.name} —`);
  try {
    const p = new ethers.JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true });
    const [id, block] = await Promise.all([p.send("eth_chainId", []), p.getBlockNumber()]);
    if (Number(id) !== chain.chainId) { bad(`RPC trả về chainId ${Number(id)}, cần ${chain.chainId}`); continue; }
    ok(`RPC chạy tốt (block ${block})`);
    if (addr) {
      const [bal, nonce] = await Promise.all([p.getBalance(addr), p.getTransactionCount(addr)]);
      const b = Number(ethers.formatUnits(bal, chain.nativeDecimals));
      (b >= 1 ? ok : bad)(`Số dư: ${b} ${chain.nativeSymbol} · đã gửi ${nonce} giao dịch`);
      if (b < 1) info(`Xin USDC miễn phí tại ${chain.faucet} → chọn ${chain.name} → dán ${shortAddr(addr)}`);
      info(`Xem ví: ${chain.explorer}/address/${addr}`);
    }
  } catch (e) { bad(`Không kết nối được RPC ${chain.rpc}: ${e.shortMessage || e.message}`); }
}
