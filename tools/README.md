# 🤖 Tool farm (app tải về máy)

Mỗi tool là **1 app độc lập** cho Linux và/hoặc Windows. Tải ở nút **⬇️ Tải tool** trên tracker, mở lên là có menu tiếng Việt:

```
  1. Cài ví farm (private key)
  2. Kiểm tra kết nối & số dư
  3. Farm ngay bây giờ
  4. Chạy thử (không gửi giao dịch)
  5. Xem tình trạng
  6. Bật chạy tự động mỗi ngày
  7. Tắt chạy tự động
  8. Báo kết quả qua Telegram (tuỳ chọn)
```

- Không cần cài Node hay thư viện gì, chỉ cần giải nén rồi mở.
- **Private key chỉ lưu trên máy bạn**, ở `~/.config/ltfarm/<tool>/` (Linux) hoặc `%APPDATA%\LTFarm\<tool>\` (Windows). Tool không gửi key đi đâu cả.
- Bật tự chạy (mục 6) thì Linux dùng systemd, Windows dùng Task Scheduler. Tool chạy mỗi ngày 1 lần vào giờ ngẫu nhiên 8h–20h, và khoảng 10% số ngày tự nghỉ cho giống người thật. Sau khi bật thì **đừng di chuyển file app** (muốn chuyển thì chọn 7 tắt, chuyển xong chọn 6 bật lại).
- Windows có thể cảnh báo "Windows protected your PC" vì app chưa được ký số: bấm **More info → Run anyway**.

| Tool | Kèo | Làm gì |
|---|---|---|
| `arc` | Arc (Circle) | 2–4 giao dịch nhỏ ngẫu nhiên mỗi ngày trên Arc Testnet: gửi/chuyển USDC, EURC, approve, thỉnh thoảng deploy contract |

## Dành cho người viết tool (Claude, sáng thứ Hai)
- Khuôn mẫu: `arc/` (gồm `tool.json` và `app.mjs`), khung dùng chung là `common.mjs`, thông số mạng ở `chains.mjs`.
- Test: `npm install && npm run test:tool -- <id>` (blockchain giả lập, không cần key thật).
- Đóng gói: `node build.mjs <id>` → `dist/<id>/`.
- Phát hành: `bash tools/publish.sh <id>` (đóng gói → GitHub Release → ghi link tải vào `airdrops.json` → push).

Chi tiết quy trình xem `docs/WEEKLY.md`.
