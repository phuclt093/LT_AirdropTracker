#!/usr/bin/env bash
# Cài worker lên máy nhà (Ubuntu) bằng systemd --user. Không cần sudo, trừ bước bật "linger".
#   bash install.sh            → cài / cập nhật đầy đủ (lần đầu dùng lệnh này)
#   bash install.sh units      → chỉ tạo lại lịch chạy (update.sh tự gọi khi có tool mới)
#   bash install.sh status     → xem lịch chạy + log gần nhất
#   bash install.sh uninstall  → gỡ toàn bộ lịch chạy
#
# Mỗi file farm-<tên>.mjs trong thư mục này tự có 1 lịch chạy riêng: airdrop-farm-<tên>.
set -euo pipefail
cd "$(dirname "$0")"
WORKER_DIR="$(pwd)"
REPO_DIR="$(cd .. && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

green(){ printf "\e[32m%s\e[0m\n" "$*"; }; red(){ printf "\e[31m%s\e[0m\n" "$*"; }; step(){ printf "\n\e[1m▶ %s\e[0m\n" "$*"; }
all_units(){ ls "$UNIT_DIR"/airdrop-*.timer 2>/dev/null | xargs -rn1 basename | sed 's/\.timer$//'; }

MODE="${1:-full}"

if [[ "$MODE" == "status" ]]; then
  systemctl --user list-timers 'airdrop-*' --all
  for u in $(all_units); do echo; echo "── $u (15 dòng log cuối) ──"; journalctl --user -u "$u.service" -n 15 --no-pager || true; done
  exit 0
fi
if [[ "$MODE" == "uninstall" ]]; then
  for u in $(all_units); do systemctl --user disable --now "$u.timer" 2>/dev/null || true; rm -f "$UNIT_DIR/$u.service" "$UNIT_DIR/$u.timer"; done
  systemctl --user daemon-reload; green "Đã gỡ các lịch chạy. File .env và code vẫn giữ nguyên."; exit 0
fi

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { red "Chưa có Node.js. Cài:  sudo apt install -y nodejs npm   (hoặc dùng nvm)"; exit 1; }

if [[ "$MODE" == "full" ]]; then
  step "1. Kiểm tra Node.js (cần >= 20.6)"
  "$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=6)?0:1)' \
    || { red "Node $("$NODE_BIN" -v) quá cũ, cần >= 20.6"; exit 1; }
  green "Node $("$NODE_BIN" -v) tại $NODE_BIN"

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
fi
mkdir -p "$UNIT_DIR"

write_unit(){ # name, description, execstart, oncalendar, randomdelay, timeout
  cat > "$UNIT_DIR/$1.service" <<EOF
[Unit]
Description=$2
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$WORKER_DIR
ExecStart=$3
TimeoutStartSec=$6
Nice=10
EOF
  cat > "$UNIT_DIR/$1.timer" <<EOF
[Unit]
Description=$2 (lịch)

[Timer]
OnCalendar=$4
RandomizedDelaySec=$5
Persistent=true

[Install]
WantedBy=timers.target
EOF
}

WANT=()
# 1 lịch farm cho mỗi farm-*.mjs — 1 lần/ngày, giờ ngẫu nhiên 8h–20h
for f in farm-*.mjs; do
  [[ -e "$f" ]] || continue
  name="airdrop-${f%.mjs}"
  write_unit "$name" "Airdrop Tracker - ${f%.mjs}" "$NODE_BIN --env-file=.env $f" "*-*-* 08:00:00 Asia/Ho_Chi_Minh" "12h" "1h"
  WANT+=("$name")
done
write_unit airdrop-stats "Airdrop Tracker - cập nhật số liệu on-chain" "$NODE_BIN --env-file=.env stats.mjs" "*-*-* 00/6:17:00" "20min" "10min"
WANT+=(airdrop-stats)
# Tự cập nhật code từ GitHub mỗi ngày ~4h sáng (sau khi bạn merge PR thứ Hai)
write_unit airdrop-update "Airdrop Tracker - tự cập nhật code" "/usr/bin/env bash $WORKER_DIR/update.sh" "*-*-* 04:00:00 Asia/Ho_Chi_Minh" "30min" "15min"
WANT+=(airdrop-update)

# Gỡ lịch của tool đã bị xoá
for u in $(all_units); do
  if [[ ! " ${WANT[*]} " =~ " $u " ]]; then
    systemctl --user disable --now "$u.timer" 2>/dev/null || true; rm -f "$UNIT_DIR/$u.service" "$UNIT_DIR/$u.timer"; echo "Đã gỡ lịch cũ: $u"
  fi
done
systemctl --user daemon-reload
for u in "${WANT[@]}"; do systemctl --user enable --now "$u.timer" >/dev/null 2>&1; done

if [[ "$MODE" == "full" ]]; then
  step "6. Cho phép chạy cả khi không đăng nhập (linger)"
  if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
    echo "Cần sudo một lần để bật:"; sudo loginctl enable-linger "$USER"
  fi
  green "Linger đã bật"
fi

echo
systemctl --user list-timers 'airdrop-*' --no-pager
if [[ "$MODE" == "full" ]]; then green "
Xong! Lệnh hay dùng:
  bash install.sh status                         # xem lịch + log
  systemctl --user start airdrop-farm-arc        # farm ngay (vẫn có thể 'nghỉ' theo SKIP_CHANCE)
  cd $WORKER_DIR && FORCE=1 npm run farm:arc     # farm ngay, không bao giờ nghỉ
  npm run farm:arc:dry                           # chạy thử, không gửi giao dịch"; fi
exit 0
