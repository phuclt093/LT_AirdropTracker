# 🤖 Tool farm (app tải về máy)

Mỗi tool là **1 app độc lập** cho Linux và/hoặc Windows. Tải ở nút **⬇️ Tải tool** trên tracker, giải nén rồi **nháy đúp**: giao diện tự mở trên trình duyệt (chỉ chạy nội bộ trên máy bạn), gồm 4 bước bấm nút:

1. **Cài ví farm**: dán private key ví farm riêng.
2. **Xin gas miễn phí & kiểm tra**: có nút mở faucet, xem số dư, số giao dịch, số ngày đã farm.
3. **Farm thử 1 lần**: xem từng giao dịch chạy trực tiếp, có link explorer.
4. **Bật tự chạy mỗi ngày**: không cần mở giao diện nữa.

Thêm tuỳ chọn báo kết quả qua Telegram. Bấm **Thoát** để tắt giao diện; lịch tự chạy vẫn hoạt động.

- Không cần cài Node hay thư viện gì, chỉ cần giải nén rồi mở.
- **Private key chỉ lưu trên máy bạn**, ở `~/.config/ltfarm/<tool>/` (Linux) hoặc `%APPDATA%\LTFarm\<tool>\` (Windows). Tool không gửi key đi đâu cả.
- Bật tự chạy (mục 6) thì Linux dùng systemd, Windows dùng Task Scheduler. Tool chạy mỗi ngày 1 lần vào giờ ngẫu nhiên 8h–20h, và khoảng 10% số ngày tự nghỉ cho giống người thật. Sau khi bật thì **đừng di chuyển file app** (muốn chuyển thì chọn 7 tắt, chuyển xong chọn 6 bật lại).
- Linux: nếu nháy đúp không có gì xảy ra, chuột phải file → Properties → bật "Executable as Program". Lần đầu mở, app tự thêm biểu tượng vào danh sách ứng dụng (bấm phím Super, gõ "farm").
- Windows có thể cảnh báo "Windows protected your PC" vì app chưa được ký số: bấm **More info → Run anyway**.

| Tool | Kèo | Làm gì |
|---|---|---|
| `arc` | Arc (Circle) | 2–4 giao dịch nhỏ ngẫu nhiên mỗi ngày trên Arc Testnet: gửi/chuyển USDC, EURC, approve, thỉnh thoảng deploy contract |
| `giwa` | GIWA (Upbit) | Linux. 2–4 giao dịch nhỏ ngẫu nhiên mỗi ngày trên GIWA Sepolia: gửi ETH cho chính mình, wrap/unwrap WETH, thỉnh thoảng deploy contract. Faucet vẫn tự xin |

## Dành cho người viết tool (Claude, sáng thứ Hai)
- Khuôn mẫu: `arc/` (gồm `tool.json` và `app.mjs`). Khung dùng chung là `common.mjs` (lo lịch chạy, cấu hình, menu chữ `--cli`) và `gui.mjs` (giao diện). Thông số mạng ở `chains.mjs`. Tool chỉ cần viết `farm(ctx)` và tuỳ chọn `extra(ctx, address)` để thêm số liệu hiện trên giao diện.
- Test: `npm install && npm run test:tool -- <id>` (blockchain giả lập, không cần key thật).
- Đóng gói: `node build.mjs <id>` → `dist/<id>/`.
- Phát hành: `bash tools/publish.sh <id>` (đóng gói → GitHub Release → ghi link tải vào `airdrops.json` → push).

Chi tiết quy trình xem `docs/WEEKLY.md`.
