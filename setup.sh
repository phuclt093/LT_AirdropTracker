#!/usr/bin/env bash
# Chuyển 2 file workflow vào .github/workflows (chạy 1 lần sau khi tải project về)
set -e
cd "$(dirname "$0")"
mkdir -p .github/workflows
mv -f _workflows/*.yml .github/workflows/
rmdir _workflows
echo "✅ Đã chuyển workflow vào .github/workflows"
