# Quy trình cập nhật thứ Hai (dành cho Claude)

Tài liệu này là "sổ tay" cho buổi cập nhật tự động mỗi sáng thứ Hai. Ai đọc cũng hiểu được, nhưng người làm chính là Claude.

## Bối cảnh repo

| Đường dẫn | Vai trò |
|---|---|
| `airdrops.json` | Danh sách kèo (web + bot Telegram đọc). Field `tool` (do `tools/publish.sh` ghi) = kèo có app tool để tải |
| `index.html` | Web tracker (GitHub Pages). Đọc `airdrops.json`, `data/*.json`, và issue đang mở qua GitHub API |
| `data/weekly.json` | Khung **📅 Hướng dẫn tuần này** trên web |
| `tools/` | Mã nguồn các **app tool** (đóng gói 1 file cho Linux/Windows, chạy trên máy người dùng). Phát hành lên **GitHub Releases**, không chạy gì trên GitHub |
| `tools/chains.mjs` | Thông số mạng: chainId, RPC, token |

## Việc cần làm mỗi thứ Hai

1. **Đọc issue đang mở**: `gh issue list --state open`
   - `[Tool] <tên kèo>`: yêu cầu viết tool farm (xem mục "Viết tool mới" bên dưới)
   - `[Kèo] <tên>`: đề xuất kèo, cần kiểm tra rồi thêm vào `airdrops.json` hoặc từ chối kèm lý do
2. **Dò kèo mới**: tìm testnet/points program mới trong 7 ngày qua (trang tổng hợp airdrop, tin tức, X chính thức của dự án). Chỉ thêm **tối đa 3 kèo/tuần**, ưu tiên kèo có:
   - đội ngũ hoặc nhà đầu tư rõ ràng, có testnet đang chạy thật,
   - nguồn chính thức xác minh được (docs, X chính thức).
3. **Dọn kèo cũ**: kèo đã TGE hoặc có snapshot thì đổi `status` (`wait` / `claim`), kèo chết thì `drop`. Ghi lý do trong `note`.
4. **Viết/cập nhật `guide` chi tiết** cho mọi kèo mới hoặc có thay đổi (xem mục bên dưới).
5. **Viết `data/weekly.json`** (định dạng bên dưới): tóm tắt tuần và 3–6 bước cụ thể người dùng nên tự làm (quest, Discord, faucet…).
6. **Mở 1 Pull Request duy nhất**, tên `Cập nhật tuần YYYY-MM-DD`. Trong PR ghi rõ: kèo thêm/bỏ (kèm nguồn), tool mới, những gì đã test. Comment link PR vào từng issue đã xử lý; issue nào làm xong thì ghi `Closes #N` trong mô tả PR.

## Hướng dẫn chi tiết cho từng kèo (bắt buộc)

Người dùng **mới chơi airdrop**, nên viết hướng dẫn chung chung kiểu "tương tác testnet" là không dùng được. Kèo nào thêm mới hoặc có thay đổi đều phải có field `guide` trong `airdrops.json`, hiện ở khung **📖 Hướng dẫn chi tiết** trên web:

```json
"guide": {
  "updated": "YYYY-MM-DD",
  "warn": "Cảnh báo quan trọng nhất: chưa có token, rủi ro, hạn chót, scam thường gặp…",
  "steps": [
    { "t": "Tiêu đề bước (động từ, ngắn)", "d": "Bấm gì, ở đâu, điền gì — đủ để làm theo mà không phải đoán. Dùng \n• cho danh sách.", "link": "https://link-chinh-thuc", "lt": "tên-miền-hiển-thị" }
  ]
}
```

Mỗi hướng dẫn phải đạt:
- **4–8 bước theo đúng thứ tự làm**: tạo/chọn ví farm → thêm mạng (ghi đủ Network name, RPC, Chain ID, Symbol, Explorer) → faucet (lượng nhận, bao lâu xin lại, có captcha/đăng nhập không) → hành động cụ thể (bấm nút nào, gửi bao nhiêu) → cách kiểm tra đã xong (explorer/portal) → nhịp làm hằng ngày/tuần.
- Kèo nào có mạng EVM thì **bắt buộc thêm field `network`** (chainId dạng số, chainName, rpcUrls, nativeCurrency {name,symbol,decimals}, blockExplorerUrls), lấy **từ docs chính thức**. Web sẽ hiện nút 🦊 "Thêm mạng vào MetaMask (1 click)" để người dùng không phải gõ tay. Bước "thêm mạng" trong `guide` thì hướng dẫn bấm nút đó trước, cách thêm tay để sau.
- Task X (Twitter): dùng `xFollow: ["handle"]` (nút Follow 1 click) và `xTweet: "nội dung"` (mở trang đăng tweet điền sẵn) trong bước tương ứng. Handle phải lấy từ website/docs chính thức. Tweet mẫu viết tự nhiên, bằng tiếng Việt hoặc tiếng Anh, đúng yêu cầu của quest. **Không bao giờ** hướng dẫn tạo nhiều tài khoản X, mua follower hay dùng bot tự follow/like.
- Mỗi bước có **1 link chính thức** nếu có, kèm tên miền hiển thị trong `lt` để người dùng nhận ra link giả.
- Ghi rõ **mốc thời gian** (snapshot, season, hạn đăng ký) theo giờ Việt Nam nếu có.
- Có bước nào tool tự động hoá được thì ghi ở bước cuối và gợi ý bấm "🤖 Nhờ viết tool".
- Kèo **phải nạp tiền thật** thì không để ở trạng thái `farm`: chuyển sang `drop` (hoặc `wait`) và giải thích trong `guide`.
- `daily` / `once` ngắn gọn, khớp với các bước trong `guide`.
- Kiểm tra lại hướng dẫn của các kèo cũ mỗi tuần: link còn sống không, có thay đổi gì không. Sửa thì cập nhật `updated`.

Web tự đồng bộ `name/chain/status/prio/daily/once/note/web/x` từ `airdrops.json` sang trình duyệt người dùng, **trừ** những kèo họ đã tự bấm Sửa.

## Quy tắc an toàn (bắt buộc)

- **Không bao giờ** đụng tới private key thật, file `.env`, hay yêu cầu người dùng gửi key.
- **Không** viết tool vượt captcha, giả lập nhiều ví, đổi IP, hay lách cơ chế chống bot (sybil). Tool chỉ phục vụ **1 ví** của chủ repo.
- **Không** thêm link chưa xác minh. Link phải lấy từ docs hoặc X chính thức. Thấy dấu hiệu scam ("claim token" khi dự án chưa có token, domain lạ) thì từ chối và ghi lý do trong issue.
- Không bao giờ ghi địa chỉ ví đầy đủ vào `data/` (repo public).
- Nếu một yêu cầu tool không làm được vì cần đăng nhập web, captcha, Discord hay quest off-chain, thì trả lời trong issue và giải thích người dùng nên tự làm phần nào. Không đóng issue khi chưa giải thích.

## Viết tool mới (`[Tool] ...`)

Tool là **app độc lập** chạy trên máy người dùng, không chạy trên GitHub và không ghi gì vào repo lúc chạy. Issue có mục **Nền tảng**: Linux / Windows / Cả hai.

1. Tìm thông số **từ docs chính thức**: chainId, RPC, explorer, faucet, địa chỉ token/contract cần dùng.
2. Thêm mạng vào `tools/chains.mjs` (key ngắn, chữ thường). RPC đọc từ `process.env.<KEY>_RPC` trước, rồi mới tới RPC chính thức.
3. Tạo `tools/<id>/tool.json` theo mẫu `tools/arc/tool.json`:
   - `id`, `name` (tiếng Việt), `version` (bắt đầu `1.0.0`, sửa tool thì tăng), `keo` (id kèo trong `airdrops.json`), `chain` (key mạng nếu khác `id`), `notes` (1–2 câu tool làm gì, cần chuẩn bị gì),
   - `platforms`: `["linux"]`, `["windows"]` hoặc `["linux","windows"]` **đúng theo mục Nền tảng trong issue**.
   - `mode`: `"gui"` (giao diện trực quan, mặc định) hoặc `"batch"` (menu chữ trong cửa sổ dòng lệnh, có tham số `--farm` / `--status` để gọi từ script) **đúng theo mục Kiểu app trong issue**. Cả hai kiểu dùng chung một `app.mjs`, chỉ khác `mode`.
4. Tạo `tools/<id>/app.mjs` theo khuôn `tools/arc/app.mjs`: viết hàm `farm(ctx)` (và `status` nếu cần), rồi gọi `runApp(...)` từ `tools/common.mjs`. Khung đã lo sẵn **giao diện đồ hoạ** (nháy đúp là mở trên trình duyệt, 4 bước: cài ví → xin gas → farm thử → bật tự chạy), lịch chạy tự động (systemd / Task Scheduler), Telegram, khoá chống chạy trùng, nhật ký. Muốn hiện thêm số liệu trên giao diện thì viết `extra(ctx, address)` trả về `[{label, value}]`. Với `mode: "gui"` thì **không bao giờ** bắt người dùng mở terminal.
   - Bên trong `farm`: kiểm tra chainId và số dư tối thiểu (báo đi xin faucet), làm 2–4 hành động ngẫu nhiên, có nghỉ giữa chừng (đọc `ctx.setting(...)`; `LTFARM_FAST` thì nghỉ 1–2s), mỗi giao dịch thử lại 1 lần, tôn trọng `ctx.dry`, trả về `{ ok, txCount, actions, error? }`.
   - Chỉ dùng hành động on-chain an toàn: chuyển cho chính mình, approve, swap nhỏ trên DEX **chính thức**, mint/faucet contract công khai, deploy contract nhỏ. Không gửi tiền tới địa chỉ lạ.
5. **Test bắt buộc trước khi phát hành:**
   ```bash
   cd tools && npm install
   npm run test:tool -- <id>                          # mã nguồn, phải đạt 5/5
   node build.mjs <id> && npm run test:tool -- <id> dist/<id>/ltfarm-<id>   # file Linux đã đóng gói, 5/5
   ```
   Tool gọi contract đặc biệt (router DEX…) thì khai báo mock trong `chains.<key>.mocks` (`{ "<address>": "<solidity source của contract M>" }`).
6. **Phát hành:** `bash tools/publish.sh <id>`. Script đóng gói, tạo GitHub Release `tool-<id>-v<version>`, rồi ghi field `tool` (link tải) vào `airdrops.json`. Không có quyền tạo release thì vẫn commit mã nguồn trong PR, ghi rõ trong PR là chủ repo cần chạy `bash tools/publish.sh <id>` sau khi merge.
7. Trong `guide` của kèo, thêm 1 bước "Tải tool": bấm ⬇️ → giải nén → nháy đúp → làm 4 bước trên giao diện. Nhắc cảnh báo SmartScreen trên Windows ("More info → Run anyway") và cách bật "Executable as Program" trên Linux nếu nháy đúp không chạy.

## Định dạng `data/weekly.json`

```json
{
  "week": "2026-11-09",
  "title": "Tuần này: Flop Labs mở testnet, thêm tool GIWA",
  "summary": "1–2 câu tóm tắt tình hình.",
  "steps": [
    { "keo": "Flop Labs", "text": "Testnet đã mở: kết nối ví và làm task đầu tiên", "link": "https://..." },
    { "keo": "Arc", "text": "Xin faucet EURC để tool có thêm loại giao dịch" }
  ],
  "new": ["Tên kèo mới"],
  "tools": ["GIWA"],
  "pr": "https://github.com/phuclt093/LT_AirdropTracker/pull/N"
}
```

Mọi chữ hiển thị viết **tiếng Việt**, ngắn gọn. `link` chỉ dùng link chính thức.
