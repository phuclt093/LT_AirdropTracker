# Quy trình cập nhật thứ Hai (dành cho Claude)

Tài liệu này là "sổ tay" cho buổi cập nhật tự động mỗi sáng thứ Hai. Ai đọc cũng hiểu được, nhưng người làm chính là Claude.

## Bối cảnh repo

| Đường dẫn | Vai trò |
|---|---|
| `airdrops.json` | Danh sách kèo (web + bot Telegram đọc). `onchain: "<key>"` = kèo có tool farm trên máy nhà |
| `index.html` | Web tracker (GitHub Pages). Đọc `airdrops.json`, `data/*.json`, và issue đang mở qua GitHub API |
| `data/weekly.json` | Khung **📅 Hướng dẫn tuần này** trên web |
| `data/stats.json`, `data/runs.json` | Do worker máy nhà ghi, **không sửa tay** |
| `worker/` | Chạy trên máy nhà (Ubuntu, systemd --user). Mỗi `farm-<key>.mjs` tự có lịch chạy riêng |
| `worker/chains.mjs` | Thông số mạng: chainId, RPC, token |
| `worker/update.sh` | Máy nhà tự `git pull` mỗi ngày ~4h sáng. Code chỉ chạy **sau khi chủ repo merge PR** |

## Việc cần làm mỗi thứ Hai

1. **Đọc issue đang mở**: `gh issue list --state open`
   - `[Tool] <tên kèo>`: yêu cầu viết tool farm (xem mục "Viết tool mới" bên dưới)
   - `[Kèo] <tên>`: đề xuất kèo, cần kiểm tra rồi thêm vào `airdrops.json` hoặc từ chối kèm lý do
2. **Dò kèo mới**: tìm testnet/points program mới trong 7 ngày qua (trang tổng hợp airdrop, tin tức, X chính thức của dự án). Chỉ thêm **tối đa 3 kèo/tuần**, ưu tiên kèo có:
   - đội ngũ hoặc nhà đầu tư rõ ràng, có testnet đang chạy thật,
   - nguồn chính thức xác minh được (docs, X chính thức).
3. **Dọn kèo cũ**: kèo đã TGE hoặc có snapshot thì đổi `status` (`wait` / `claim`), kèo chết thì `drop`. Ghi lý do trong `note`.
4. **Viết `data/weekly.json`** (định dạng bên dưới): tóm tắt tuần và 3–6 bước cụ thể người dùng nên tự làm (quest, Discord, faucet…).
5. **Mở 1 Pull Request duy nhất**, tên `Cập nhật tuần YYYY-MM-DD`. Trong PR ghi rõ: kèo thêm/bỏ (kèm nguồn), tool mới, những gì đã test. Comment link PR vào từng issue đã xử lý; issue nào làm xong thì ghi `Closes #N` trong mô tả PR.

## Quy tắc an toàn (bắt buộc)

- **Không bao giờ** đụng tới private key thật, file `.env`, hay yêu cầu người dùng gửi key.
- **Không** viết tool vượt captcha, giả lập nhiều ví, đổi IP, hay lách cơ chế chống bot (sybil). Tool chỉ phục vụ **1 ví** của chủ repo.
- **Không** thêm link chưa xác minh. Link phải lấy từ docs hoặc X chính thức. Thấy dấu hiệu scam ("claim token" khi dự án chưa có token, domain lạ) thì từ chối và ghi lý do trong issue.
- Không bao giờ ghi địa chỉ ví đầy đủ vào `data/` (repo public).
- Nếu một yêu cầu tool không làm được vì cần đăng nhập web, captcha, Discord hay quest off-chain, thì trả lời trong issue và giải thích người dùng nên tự làm phần nào. Không đóng issue khi chưa giải thích.

## Viết tool mới (`[Tool] ...`)

1. Tìm thông số **từ docs chính thức**: chainId, RPC, explorer, faucet, địa chỉ token/contract cần dùng.
2. Thêm mạng vào `worker/chains.mjs` (key ngắn, chữ thường). RPC đọc từ `process.env.<KEY>_RPC` trước, rồi mới tới RPC chính thức.
3. Tạo `worker/farm-<key>.mjs` bằng cách **sao chép cấu trúc `farm-arc.mjs`**:
   - `lockOrExit`, `SKIP_CHANCE`, kiểm tra chainId, kiểm tra số dư tối thiểu (báo đi xin faucet),
   - 2–4 hành động ngẫu nhiên có nghỉ giữa chừng, mỗi giao dịch thử lại 1 lần,
   - ghi `data/runs.json` qua `recordRun`, gọi `finish()` để cập nhật stats và push,
   - biến tinh chỉnh dạng `<KEY>_MIN_ACTIONS`, `<KEY>_MIN_DELAY`… thêm vào `worker/.env.example`,
   - đường dẫn state đọc `AIRDROP_STATE_DIR` (để test chạy được).
   Chỉ dùng hành động on-chain an toàn: chuyển cho chính mình, approve, swap nhỏ trên DEX **chính thức**, mint NFT/faucet contract công khai, deploy contract nhỏ. Không gửi tiền tới địa chỉ lạ.
4. Thêm script npm `farm:<key>` và `farm:<key>:dry` vào `worker/package.json`.
5. Trong `airdrops.json`, gắn `"onchain": "<key>"` cho kèo đó (web sẽ hiện khung số liệu và nhãn **🤖 Có tool**).
6. **Test bắt buộc trước khi mở PR:**
   ```bash
   cd worker && npm install && npm run test:farm -- <key>
   ```
   Phải đạt hết 7 tiêu chí. Nếu tool gọi contract đặc biệt (router DEX…), khai báo mock trong `chains.<key>.mocks` (`{ "<address>": "<solidity source của contract M>" }`) để test giả lập chạy được.
7. Thêm vào `worker/README.md` một dòng mô tả tool và những gì người dùng phải chuẩn bị (faucet, token…).

Khi chủ repo merge, máy nhà tự `git pull` lúc ~4h sáng hôm sau, thấy `farm-<key>.mjs` mới thì tự tạo lịch chạy. Ví farm dùng chung `PRIVATE_KEY` (cùng địa chỉ EVM trên mọi mạng).

## Định dạng `data/weekly.json`

```json
{
  "week": "2026-11-09",
  "title": "Tuần này: Flop Labs mở testnet, thêm tool GIWA",
  "summary": "1–2 câu tóm tắt tình hình.",
  "steps": [
    { "keo": "Flop Labs", "text": "Testnet đã mở: kết nối ví và làm task đầu tiên", "link": "https://..." },
    { "keo": "Arc", "text": "Xin faucet EURC để worker có thêm loại giao dịch" }
  ],
  "new": ["Tên kèo mới"],
  "tools": ["GIWA"],
  "pr": "https://github.com/phuclt093/LT_AirdropTracker/pull/N"
}
```

Mọi chữ hiển thị viết **tiếng Việt**, ngắn gọn. `link` chỉ dùng link chính thức.
