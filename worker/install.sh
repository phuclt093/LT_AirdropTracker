#!/usr/bin/env bash
# Cài worker lên máy nhà (Ubuntu) bằng systemd --user. Không cần sudo, trừ bước bật "linger".
#   bash install.sh            → cài / cập nhật
#   bash install.sh status     → xem lịch chạy + log gần nhất
#   bash install.sh uninstall  → gỡ các timer
set -euo pipefail
cd "$(dirname "$0")"
WORKER_DIR="$(pwd)"
REPO_DIR="$(cd .. && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
UNITS=(airdrop-farm-arc airdrop-stats)

green(){ printf "\e[32m%s\e[0m\n" "$*"; }; red(){ printf "\e[31m%s\e[0m\n" "$*"; }; step(){ printf "\n\e[1m▶ %s\e[0m\n" "$*"; }

if [[ "${1:-}" == "status" ]]; then
  systemctl --user list-timers 'airdrop-*' --all
  for u in "${UNITS[@]}"; do echo; echo "── $u (20 dòng log cuối) ──"; journalctl --user -u "$u.service" -n 20 --no-pager || true; done
  exit 0
fi
if [[ "${1:-}" == "uninstall" ]]; then
  for u in "${UNITS[@]}"; do systemctl --user disable --now "$u.timer" 2>/dev/null || true; rm -f "$UNIT_DIR/$u.service" "$UNIT_DIR/$u.timer"; done
  systemctl --user daemon-reload; green "Đã gỡ các timer. File .env và code vẫn giữ nguyên."; exit 0
fi

step "1. Kiểm tra Node.js (cần >= 20.6)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then red "Chưa có Node.js. Cài:  sudo apt install -y nodejs npm   (hoặc dùng nvm)"; exit 1; fi
NODE_VER="$("$NODE_BIN" -p 'process.versions.node')"
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=6)?0:1)' \
  || { red "Node $NODE_VER quá cũ, cần >= 20.6"; exit 1; }
green "Node $NODE_VER tại $NODE_BIN"

step "2. Cài thư viện"
npm install --omit=dev --no-audit --no-fund

step "3. File .env"
if [[ ! -f .env ]]; then
  cp .env.example .env && chmod 600 .env
  red "Đã tạo worker/.env — mở ra điền PRIVATE_KEY của VÍ FARM rồi chạy lại: bash install.sh"
  echo "   nano $WORKER_DIR/.env"
  exit 0
fi
chmod 600 .env
if git -C "$REPO_DIR" ls-files --error-unmatch worker/.env >/dev/null 2>&1; then
  red "NGUY HIỂM: worker/.env đang bị git theo dõi! Chạy: git rm --cached worker/.env rồi commit."; exit 1
fi
"$NODE_BIN" --env-file=.env check.mjs || true

step "4. Kiểm tra quyền push lên GitHub (để web nhận số liệu)"
if command -v gh >/dev/null 2>&1; then gh auth setup-git >/dev/null 2>&1 || true; fi
if git -C "$REPO_DIR" push --dry-run >/dev/null 2>&1; then green "Push được ✔"
else red "Chưa push được — worker vẫn chạy nhưng web không thấy số liệu. Chạy: gh auth login"; fi

step "5. Tạo lịch chạy (systemd --user)"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/airdrop-farm-arc.service" <<EOF
[Unit]
Description=Airdrop Tracker - farm Arc testnet
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$WORKER_DIR
ExecStart=$NODE_BIN --env-file=.env farm-arc.mjs
TimeoutStartSec=1h
Nice=10
EOF
cat > "$UNIT_DIR/airdrop-farm-arc.timer" <<EOF
[Unit]
Description=Farm Arc mỗi ngày 1 lần, giờ ngẫu nhiên 8h-20h

[Timer]
OnCalendar=*-*-* 08:00:00 Asia/Ho_Chi_Minh
RandomizedDelaySec=12h
Persistent=true

[Install]
WantedBy=timers.target
EOF
cat > "$UNIT_DIR/airdrop-stats.service" <<EOF
[Unit]
Description=Airdrop Tracker - cập nhật số liệu on-chain
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$WORKER_DIR
ExecStart=$NODE_BIN --env-file=.env stats.mjs
TimeoutStartSec=10min
Nice=10
EOF
cat > "$UNIT_DIR/airdrop-stats.timer" <<EOF
[Unit]
Description=Cập nhật số liệu on-chain mỗi 6 tiếng

[Timer]
OnCalendar=*-*-* 00/6:17:00
RandomizedDelaySec=20min
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
for u in "${UNITS[@]}"; do systemctl --user enable --now "$u.timer"; done

step "6. Cho phép chạy cả khi không đăng nhập (linger)"
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
  echo "Cần sudo một lần để bật:"; sudo loginctl enable-linger "$USER"
fi
green "Linger đã bật"

echo
systemctl --user list-timers 'airdrop-*'
green "
Xong! Lệnh hay dùng:
  bash install.sh status                         # xem lịch + log
  systemctl --user start airdrop-farm-arc        # farm ngay bây giờ (vẫn có thể 'nghỉ' theo SKIP_CHANCE)
  cd $WORKER_DIR && FORCE=1 npm run farm:arc     # farm ngay, không bao giờ nghỉ
  npm run farm:arc:dry                           # chạy thử, không gửi giao dịch"
