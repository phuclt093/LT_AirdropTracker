// Đóng gói tool thành 1 file chạy cho Linux / Windows.
//   node build.mjs arc               → cả 2 nền tảng ghi trong tools/arc/tool.json
//   node build.mjs arc linux         → chỉ Linux
// Kết quả: tools/dist/<id>/ltfarm-<id>-linux-x64.tar.gz, ltfarm-<id>-windows-x64.zip
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const [id, only] = process.argv.slice(2);
if (!id || !existsSync(join(ROOT, id, "tool.json"))) { console.error("Dùng: node build.mjs <id> [linux|windows]"); process.exit(2); }
const meta = JSON.parse(readFileSync(join(ROOT, id, "tool.json"), "utf8"));
const platforms = only ? [only] : meta.platforms || ["linux", "windows"];
const out = join(ROOT, "dist", id);
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const bun = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "bun.exe" : "bun");
const run = (cmd, args, opt = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opt });

const TARGET = { linux: "bun-linux-x64", windows: "bun-windows-x64" };
const files = [];
for (const p of platforms) {
  if (!TARGET[p]) { console.error("Nền tảng không hỗ trợ: " + p); process.exit(2); }
  const exe = join(out, p === "windows" ? `ltfarm-${id}.exe` : `ltfarm-${id}`);
  console.log(`\n▶ Đóng gói ${meta.name} v${meta.version} cho ${p}`);
  run(bun, ["build", "--compile", "--minify", `--target=${TARGET[p]}`, join(id, "app.mjs"), "--outfile", exe]);
  const readme = `${meta.name} v${meta.version}\n\n${meta.notes || ""}\n\nCÁCH DÙNG\n` +
    (p === "windows"
      ? `1. Giải nén, nháy đúp ltfarm-${id}.exe (Windows có thể cảnh báo "Windows protected your PC" vì app chưa ký: bấm More info → Run anyway).\n`
      : `1. Giải nén, mở Terminal tại thư mục này, chạy: ./ltfarm-${id}\n`) +
    `2. Chọn 1 → dán private key của VÍ FARM RIÊNG (không dùng ví chính).\n3. Xin gas ở faucet, chọn 2 để kiểm tra, chọn 3 để farm thử.\n4. Chọn 6 để tool tự chạy mỗi ngày. Đừng di chuyển file sau khi bật.\n\nDữ liệu (ví, nhật ký) chỉ lưu trên máy bạn: ${p === "windows" ? "%APPDATA%\\LTFarm\\" + id : "~/.config/ltfarm/" + id}\n`;
  const readmeFile = join(out, `HUONG-DAN-${p}.txt`);
  execFileSync("python3", ["-c", "import sys;open(sys.argv[1],'w',encoding='utf-8').write(sys.argv[2])", readmeFile, readme]);
  if (p === "windows") {
    const zip = join(out, `ltfarm-${id}-windows-x64.zip`);
    execFileSync("python3", ["-c", `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
z.write(sys.argv[2],'ltfarm-${id}/ltfarm-${id}.exe');z.write(sys.argv[3],'ltfarm-${id}/HUONG-DAN.txt');z.close()`, zip, exe, readmeFile]);
    files.push(zip);
  } else {
    const tgz = join(out, `ltfarm-${id}-linux-x64.tar.gz`);
    execFileSync("tar", ["-czf", tgz, "-C", out, "--transform", `s,^,ltfarm-${id}/,`, `ltfarm-${id}`, `HUONG-DAN-${p}.txt`]);
    files.push(tgz);
  }
}
console.log("\n✅ Xong:\n" + files.map((f) => "   " + f).join("\n"));
