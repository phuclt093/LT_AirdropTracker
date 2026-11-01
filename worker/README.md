# 🤖 Worker máy nhà

Worker chạy trên máy nhà (Ubuntu, bật 24/7). Nó làm 2 việc:

| Việc | Lịch | Kết quả |
|---|---|---|
| `farm-arc.mjs`: farm Arc testnet | 1 lần/ngày, giờ ngẫu nhiên 8h–20h, ~10% số ngày tự nghỉ | 2–4 giao dịch nhỏ, chọn ngẫu nhiên: gửi USDC, chuyển USDC/EURC, approve, thỉnh thoảng deploy contract hoặc gọi contract |
| `stats.mjs`: thu thập số liệu | 6 tiếng/lần | Ghi `data/stats.json` và tự push lên GitHub, web hiện số liệu |
| `update.sh`: tự cập nhật | Mỗi ngày ~4h sáng | `git pull` code bạn đã merge. Có `farm-*.mjs` mới thì tự tạo lịch chạy cho nó |

Mỗi file `farm-<tên>.mjs` là 1 tool và tự có lịch chạy riêng. Tool mới do Claude viết vào thứ Hai (xem `docs/WEEKLY.md`) và **chỉ chạy sau khi bạn merge PR**.

Private key **chỉ nằm trong `worker/.env` trên máy này**. File đó đã bị `.gitignore` chặn, không bao giờ lên GitHub. Web và GitHub chỉ thấy địa chỉ rút gọn (`0x19E7…ff2A`) cùng các con số.

## Cài đặt (làm 1 lần)

### 1. Tạo ví farm riêng
Trong MetaMask chọn **Add account**, tạo một account mới chỉ dùng để farm. Sau đó vào **Account details → Show private key** và copy key lại.

> ⚠️ Không dùng ví chính. Máy này giữ key nên ví farm chỉ nên chứa token testnet.

### 2. Xin USDC testnet
Vào https://faucet.circle.com, chọn **Arc Testnet**, dán địa chỉ ví farm rồi bấm gửi. Faucet cho khoảng 10–20 USDC, mỗi 1–2 tiếng xin được một lần. Có thể xin thêm **EURC** để worker có thêm loại giao dịch.

### 3. Cài worker
```bash
cd ~/Projects/LT_AirdropTracker/worker
bash install.sh          # lần đầu: tạo file .env rồi dừng
nano .env                # dán PRIVATE_KEY=0x... rồi lưu (Ctrl+O, Enter, Ctrl+X)
bash install.sh          # lần 2: kiểm tra + bật lịch chạy (sẽ hỏi sudo 1 lần)
```

### 4. Chạy thử ngay
```bash
npm run check            # kiểm tra key, RPC, số dư
npm run farm:arc:dry     # xem kế hoạch, KHÔNG gửi giao dịch
FORCE=1 npm run farm:arc # farm thật 1 lần ngay bây giờ
```
Mở web Airdrop Tracker. Khoảng 1–2 phút sau (sau khi GitHub deploy xong), thẻ Arc sẽ hiện khung **⛓ Arc Testnet** với số liệu.

## Lệnh hay dùng
```bash
bash install.sh status                     # lịch chạy tiếp theo + log gần nhất
systemctl --user start airdrop-farm-arc    # chạy farm ngay
journalctl --user -u airdrop-farm-arc -f   # xem log trực tiếp
bash install.sh uninstall                  # tắt worker
```
Log chi tiết từng ngày nằm ở `worker/logs/YYYY-MM-DD.jsonl`.

## Test tool trên chain giả lập
```bash
npm install                 # cài cả công cụ test (ganache, solc)
npm run test:farm -- arc    # chạy tool 2 lần trên blockchain giả, kiểm tra 7 tiêu chí
```

## Tinh chỉnh (trong `.env`)
| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ARC_MIN_ACTIONS` / `ARC_MAX_ACTIONS` | 2 / 4 | Số giao dịch mỗi lần chạy |
| `ARC_MIN_DELAY` / `ARC_MAX_DELAY` | 30 / 240 | Số giây nghỉ giữa các giao dịch |
| `SKIP_CHANCE` | 0.1 | Tỉ lệ tự nghỉ cả ngày |
| `ARC_MIN_BALANCE` | 1 | Số dư USDC dưới mức này thì không farm, chỉ báo đi xin faucet |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | trống | Báo kết quả từng lần chạy về Telegram |

## Lưu ý
- Worker chỉ làm **giao dịch on-chain cơ bản** để ví có lịch sử hoạt động đều đặn. Quest, Discord, dùng dApp thật thì bạn vẫn nên tự làm. Dự án thường đánh giá cao ví dùng sản phẩm thật hơn ví chỉ tự chuyển tiền cho mình.
- Testnet **không đảm bảo** có airdrop.
- Worker push vào thư mục `data/` mỗi khi có số liệu mới. Trước khi sửa code trên máy, nhớ `git pull` để tránh xung đột.
