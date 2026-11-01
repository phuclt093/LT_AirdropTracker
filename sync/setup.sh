#!/usr/bin/env bash
# Cài máy chủ đồng bộ (Cloudflare Worker, gói miễn phí) — chạy 1 lần.
#   cd ~/Projects/LT_AirdropTracker/sync && bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"
REPO_DIR="$(cd .. && pwd)"
green(){ printf "\e[32m%s\e[0m\n" "$*"; }; red(){ printf "\e[31m%s\e[0m\n" "$*"; }; step(){ printf "\n\e[1m▶ %s\e[0m\n" "$*"; }

step "1. Cài thư viện"
npm install --no-audit --no-fund

step "2. Đăng nhập Cloudflare (nếu chưa)"
if ! npx wrangler whoami 2>/dev/null | grep -qi "associated with the email\|You are logged in"; then
  npx wrangler login
fi
npx wrangler whoami | grep -i email || true

step "3. Tạo kho lưu (KV)"
if grep -q "THAY_BANG_ID_KV" wrangler.jsonc; then
  out="$(npx wrangler kv namespace create SYNC 2>&1)"; echo "$out"
  id="$(echo "$out" | grep -oE '[0-9a-f]{32}' | head -1)"
  [[ -n "$id" ]] || { red "Không đọc được id KV. Dán tay id vào wrangler.jsonc (chỗ THAY_BANG_ID_KV) rồi chạy lại."; exit 1; }
  sed -i "s/THAY_BANG_ID_KV/$id/" wrangler.jsonc
  green "KV id: $id"
else green "Đã có KV"; fi

step "4. Đưa worker lên Cloudflare"
out="$(npx wrangler deploy 2>&1)"; echo "$out"
url="$(echo "$out" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)"
[[ -n "$url" ]] || { red "Không thấy URL worker trong kết quả. Copy URL *.workers.dev dán vào \"syncApi\" trong airdrops.json."; exit 1; }
green "Worker: $url"

step "5. Tạo khoá bí mật cho worker (SECRET)"
if ! npx wrangler secret list 2>/dev/null | grep -q '"SECRET"'; then
  head -c 48 /dev/urandom | base64 | tr -d '\n' | npx wrangler secret put SECRET
else green "Đã có SECRET"; fi

sleep 3; curl -s "$url/" && echo

step "6. Ghi URL vào airdrops.json"
node -e '
const fs=require("fs"),p=process.argv[1],u=process.argv[2];
const d=JSON.parse(fs.readFileSync(p,"utf8"));d.syncApi=u;fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n");
console.log("syncApi =",u);' "$REPO_DIR/airdrops.json" "$url"

green "
Xong! Giờ đẩy lên GitHub để web nhận:
  cd $REPO_DIR && git add . && git commit -m \"Bật đồng bộ theo ví\" && git push
Sau ~1 phút, mở web → bấm 🔐 Đăng nhập bằng MetaMask → Ký (không tốn gas)."
