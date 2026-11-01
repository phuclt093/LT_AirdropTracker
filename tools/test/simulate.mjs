// Test 1 tool trên blockchain GIẢ LẬP (ganache) — không đụng mạng thật, không cần key thật.
//   cd tools && npm install && npm run test:tool -- arc            (chạy mã nguồn)
//   npm run test:tool -- arc dist/arc/ltfarm-arc                   (chạy file đã đóng gói)
import ganache from "ganache";
import solc from "solc";
import { ethers } from "ethers";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAINS } from "../chains.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [id, binArg] = process.argv.slice(2);
const meta = id && existsSync(join(ROOT, id, "tool.json")) ? JSON.parse(readFileSync(join(ROOT, id, "tool.json"), "utf8")) : null;
if (!meta) { console.error("Dùng: npm run test:tool -- <id> [đường-dẫn-file-đã-đóng-gói]"); process.exit(2); }
const chainKey = meta.chain || id;
const chain = CHAINS[chainKey];
if (!chain) { console.error(`Không thấy mạng "${chainKey}" trong chains.mjs`); process.exit(2); }

const PK = "0x" + "11".repeat(32);
const PORT = 18545;
const server = ganache.server({ chain: { chainId: chain.chainId }, wallet: { accounts: [{ secretKey: PK, balance: "0x" + (1000n * 10n ** 18n).toString(16) }] }, logging: { quiet: true } });
await server.listen(PORT);
const rpc = `http://127.0.0.1:${PORT}`;

const MOCK_ERC20 = `contract M { event Transfer(address indexed f,address indexed t,uint v);
  function balanceOf(address) external pure returns(uint){return 1000e18;}
  function decimals() external pure returns(uint8){return 18;}
  function allowance(address,address) external pure returns(uint){return type(uint).max;}
  function transfer(address t,uint v) external returns(bool){emit Transfer(msg.sender,t,v);return true;}
  function transferFrom(address f,address t,uint v) external returns(bool){emit Transfer(f,t,v);return true;}
  function approve(address,uint) external pure returns(bool){return true;}
  fallback() external payable {} receive() external payable {} }`;
const compile = (src) => {
  const out = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { "M.sol": { content: "pragma solidity ^0.8.0;\n" + src } }, settings: { outputSelection: { "*": { "*": ["evm.deployedBytecode.object"] } } } })));
  if (out.errors?.some((e) => e.severity === "error")) throw new Error(out.errors.map((e) => e.formattedMessage).join("\n"));
  return "0x" + out.contracts["M.sol"].M.evm.deployedBytecode.object;
};
const provider = new ethers.JsonRpcProvider(rpc);
const erc20 = compile(MOCK_ERC20);
for (const t of Object.values(chain.tokens || {})) await provider.send("evm_setAccountCode", [t.address, erc20]);
for (const [addr, src] of Object.entries(chain.mocks || {})) await provider.send("evm_setAccountCode", [addr, compile(src)]);

const home = mkdtempSync(join(tmpdir(), "ltfarm-test-"));
mkdirSync(join(home, id), { recursive: true });
writeFileSync(join(home, id, "config.json"), JSON.stringify({ privateKey: PK, settings: {} }));
const env = { ...process.env, LTFARM_HOME: home, LTFARM_FAST: "1", [`${chainKey.toUpperCase()}_RPC`]: rpc };
const cmd = binArg ? [resolve(binArg)] : [process.execPath, join(ROOT, id, "app.mjs")];

const runOnce = (extra) => new Promise((res) => {
  const p = spawn(cmd[0], [...cmd.slice(1), ...extra], { env, stdio: "inherit" });
  const t = setTimeout(() => p.kill("SIGKILL"), 120_000);
  p.on("exit", (status) => { clearTimeout(t); res(status); });
});

let failed = false;
for (let round = 1; round <= 2; round++) {
  console.log(`\n=== Lần chạy ${round} ===`);
  const status = await runOnce(["--farm", "--force"]);
  if (status !== 0) { failed = true; console.error(`❌ Thoát với mã ${status}`); break; }
}
console.log("\n=== --status ===");
await runOnce(["--status"]);

const st = existsSync(join(home, id, "state.json")) ? JSON.parse(readFileSync(join(home, id, "state.json"), "utf8")) : {};
const nonce = await provider.getTransactionCount(new ethers.Wallet(PK).address);
const checks = [
  ["state.json có kết quả lần chạy", !!st.last],
  ["lần chạy cuối thành công", st.last?.ok === true],
  ["có giao dịch thật trên chain", nonce > 0 && (st.last?.txCount || 0) > 0],
  ["lịch sử ghi đủ 2 lần", (st.history || []).length === 2],
  ["config không bị ghi đè mất key", JSON.parse(readFileSync(join(home, id, "config.json"), "utf8")).privateKey === PK],
];
console.log("\n=== Kết quả ===");
for (const [name, ok] of checks) { console.log(`${ok ? "✅" : "❌"} ${name}`); if (!ok) failed = true; }
await server.close();
process.exit(failed ? 1 : 0);
