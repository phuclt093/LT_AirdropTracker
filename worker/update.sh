#!/usr/bin/env bash
# Tự cập nhật code từ GitHub (chạy mỗi ngày ~4h sáng bằng timer airdrop-update).
# Chỉ kéo những gì bạn đã MERGE vào main — PR chưa duyệt thì không bao giờ chạy trên máy.
set -euo pipefail
cd "$(dirname "$0")"
REPO_DIR="$(cd .. && pwd)"
log(){ echo "[$(date '+%F %T')] $*"; }

before="$(git -C "$REPO_DIR" rev-parse HEAD)"
git -C "$REPO_DIR" fetch --quiet origin main
if ! git -C "$REPO_DIR" merge --ff-only --quiet origin/main 2>/dev/null; then
  git -C "$REPO_DIR" pull --rebase --autostash --quiet origin main || { log "❌ Không cập nhật được (xung đột?). Chạy tay: cd $REPO_DIR && git status"; exit 1; }
fi
after="$(git -C "$REPO_DIR" rev-parse HEAD)"
[[ "$before" == "$after" ]] && { log "Không có gì mới."; exit 0; }

changed="$(git -C "$REPO_DIR" diff --name-only "$before" "$after")"
log "Đã cập nhật $before → $after"
echo "$changed" | sed 's/^/   /'

if echo "$changed" | grep -q '^worker/package.json$'; then
  log "package.json đổi → npm install"; npm install --omit=dev --no-audit --no-fund --silent
fi
if echo "$changed" | grep -qE '^worker/(farm-[^/]+\.mjs|install\.sh)$'; then
  log "Có tool farm mới/sửa → tạo lại lịch chạy"; bash install.sh units
fi

# Báo Telegram nếu có cấu hình
if [[ -f .env ]]; then
  set -a; source <(grep -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=' .env); set +a
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    tools="$(echo "$changed" | grep -oE '^worker/farm-[^/]+\.mjs$' | sed 's#worker/##' | paste -sd ', ' -)"
    msg="🔄 Worker đã cập nhật code mới${tools:+ — tool: $tools}"
    curl -s -o /dev/null -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" --data-urlencode text="$msg" || true
  fi
fi
