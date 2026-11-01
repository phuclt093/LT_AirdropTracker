// Test 1 tool farm trên blockchain GIẢ LẬP (ganache) — không đụng mạng thật, không cần key thật.
//   npm install            (cài cả devDependencies: ganache, solc)
//   npm run test:farm -- arc
// Kiểm tra: script chạy hết, gửi được giao dịch, ghi runs.json + stats.json đúng định dạng.
import ganache from "ganache";
import solc from "solc";
import { ethers } from "ethers";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAINS } from "../chains.mjs";

const key = process.argv[2];
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!key || !CHAINS[key]) { console.error(`Dùng: npm run test:farm -- <${Object.keys(CHAINS).join("|")}>`); process.exit(2); }
const chain = CHAINS[key];
const script = join(WORKER, `farm-${key}.mjs`);
if (!existsSync(script)) { console.error(`Không thấy ${script}`); process.exit(2); }

const PK = "0x" + "11".repeat(32);
const PORT = 18545;
const server = ganache.server({
  chain: { chainId: chain.chainId },
  wallet: { accounts: [{ secretKey: PK, balance: "0x" + (1000n * 10n ** 18n).toString(16) }] },
  logging: { quiet: true },
});
await server.listen(PORT);
const rpc = `http://127.0.0.1:${PORT}`;

// Đặt 1 ERC-20 giả ở mọi địa chỉ token của mạng (balanceOf luôn trả số dư, transfer/approve luôn thành công).
// Nếu tool cần contract khác (router DEX, NFT...), khai báo trong chain.mocks: { address: "solidity source của contract M" }.
const MOCK_ERC20 = `contract M { event Transfer(address indexed f,address indexed t,uint v);
  function balanceOf(address) external pure returns(uint){return 1000e18;}
  function decimals() external pure returns(uint8){return 18;}
  function allowance(address,address) external pure returns(uint){return type(uint).max;}
  function transfer(address t,uint v) external returns(bool){emit Transfer(msg.sender,t,v);return true;}
  function transferFrom(address f,address t,uint v) external returns(bool){emit Transfer(f,t,v);return true;}
  function approve(address,uint) external pure returns(bool){return true;}
  fallback() external payable {} receive() external payable {} }`;
const compile = (src) => {
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { "M.sol": { content: "pragma solidity ^0.8.0;\n" + src } },
    settings: { outputSelection: { "*": { "*": ["evm.deployedBytecode.object"] } } } })));
  if (out.errors?.some((e) => e.severity === "error")) throw new Error(out.errors.map((e) => e.formattedMessage).join("\n"));
  return "0x" + out.contracts["M.sol"].M.evm.deployedBytecode.object;
};
const provider = new ethers.JsonRpcProvider(rpc);
const erc20 = compile(MOCK_ERC20);
for (const t of Object.values(chain.tokens || {})) await provider.send("evm_setAccountCode", [t.address, erc20]);
for (const [addr, src] of Object.entries(chain.mocks || {})) await provider.send("evm_setAccountCode", [addr, compile(src)]);

const dataDir = mkdtempSync(join(tmpdir(), "airdrop-data-"));
const stateDir = mkdtempSync(join(tmpdir(), "airdrop-state-"));
const env = {
  ...process.env, PRIVATE_KEY: PK, WALLET_LABEL: "Ví test", [`${key.toUpperCase()}_RPC`]: rpc,
  FORCE: "1", NO_PUSH: "1", SKIP_CHANCE: "0",
  AIRDROP_DATA_DIR: dataDir, AIRDROP_STATE_DIR: stateDir,
  [`${key.toUpperCase()}_MIN_DELAY`]: "1", [`${key.toUpperCase()}_MAX_DELAY`]: "2",
  TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "",
};
// Mạng khác Arc: các RPC khác trỏ về ganache luôn để stats không gọi ra ngoài
for (const k of Object.keys(CHAINS)) env[`${k.toUpperCase()}_RPC`] = rpc;

let failed = false;
for (let round = 1; round <= 2; round++) {
  console.log(`\n=== Lần chạy ${round} ===`);
  // chạy bất đồng bộ: chain giả lập chạy cùng tiến trình này nên không được chặn event loop
  const r = await new Promise((res) => {
    const p = spawn(process.execPath, [script], { cwd: WORKER, env, stdio: "inherit" });
    const t = setTimeout(() => p.kill("SIGKILL"), 120_000);
    p.on("exit", (status) => { clearTimeout(t); res({ status }); });
  });
  if (r.status !== 0) { failed = true; console.error(`❌ Script thoát với mã ${r.status}`); break; }
}

const runs = existsSync(join(dataDir, "runs.json")) ? JSON.parse(readFileSync(join(dataDir, "runs.json"), "utf8")) : {};
const stats = existsSync(join(dataDir, "stats.json")) ? JSON.parse(readFileSync(join(dataDir, "stats.json"), "utf8")) : {};
const last = runs[key]?.last;
const w = stats.chains?.[key]?.wallets?.[0];
const checks = [
  ["runs.json có kết quả", !!last],
  ["lần chạy cuối thành công", last?.ok === true],
  ["có giao dịch", (last?.txCount || 0) > 0],
  ["stats.json có ví", !!w],
  ["nonce > 0", (w?.nonce || 0) > 0],
  ["số ngày hoạt động >= 1", (w?.activeDays || 0) >= 1],
  ["không lộ địa chỉ đầy đủ", !JSON.stringify(stats).includes(new ethers.Wallet(PK).address)],
];
console.log("\n=== Kết quả ===");
for (const [name, ok] of checks) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (!ok) failed = true; }
await server.close();
process.exit(failed ? 1 : 0);
