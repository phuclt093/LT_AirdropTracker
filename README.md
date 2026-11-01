# 🪂 Airdrop Tracker

Bộ công cụ nhỏ để theo dõi các kèo farm airdrop, chạy **miễn phí 100% trên GitHub** và không cần thuê server:

| Phần | Chạy ở đâu | Làm gì |
|---|---|---|
| `index.html` | GitHub Pages | Web theo dõi kèo, tick việc hằng ngày, thống kê, chuỗi ngày farm, ví farm |
| `airdrops.json` | Trong repo | Danh sách kèo dùng chung cho web và bot |
| `scripts/remind.mjs` | GitHub Actions (cron) | Mỗi sáng 7:47 gửi danh sách việc cần làm về Telegram |
| `worker/` | Máy nhà (systemd) | Tự farm testnet (hiện có Arc) + đẩy số liệu on-chain lên web, xem [worker/README.md](worker/README.md) |
| `data/` | Worker tự cập nhật | `stats.json` (số liệu ví), `runs.json` (kết quả các lần farm), `weekly.json` (hướng dẫn tuần) |
| `docs/WEEKLY.md` | Claude, sáng thứ Hai | Dò kèo mới, viết tool theo yêu cầu, cập nhật hướng dẫn tuần, gửi 1 Pull Request để bạn duyệt |

---

## 1. Đưa lên GitHub

```bash
bash setup.sh   # chạy 1 lần: chuyển _workflows/ vào .github/workflows/
git init
git add .
git commit -m "Airdrop tracker"
git branch -M main
git remote add origin https://github.com/<ten-ban>/LT_AirdropTracker.git
git push -u origin main
```

> Nên để repo **Public** để GitHub Actions không giới hạn số phút. Trong repo không có gì bí mật: token Telegram để trong *Secrets*, còn tiến độ tick việc chỉ lưu trên trình duyệt của bạn.

## 2. Bật web (GitHub Pages)

1. Vào repo → **Settings → Pages**
2. Ở mục **Source**, chọn **GitHub Actions**
3. Vào tab **Actions** → chọn **Deploy web lên GitHub Pages** → **Run workflow**

Khoảng 1 phút sau web sẽ chạy ở:
`https://<ten-ban>.github.io/LT_AirdropTracker/`

## 3. Bật bot Telegram nhắc việc (tuỳ chọn)

1. Mở Telegram, chat với **@BotFather** → gõ `/newbot` → đặt tên → lấy **token**
2. Nhắn một tin bất kỳ cho bot vừa tạo
3. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates` trên trình duyệt và tìm `"chat":{"id": ...}`. Số đó là **chat id**
4. Vào repo → **Settings → Secrets and variables → Actions → New repository secret** và thêm 2 secret:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
5. Tab **Actions** → **Nhắc việc farm qua Telegram** → **Run workflow** để test

Từ đó trở đi, sáng nào bot cũng tự nhắn. Muốn đổi giờ thì sửa dòng `cron` trong `.github/workflows/remind.yml` (giờ UTC, tức giờ Việt Nam trừ 7).

> ⚠️ Nếu repo không có commit nào trong 60 ngày, GitHub sẽ tự tắt cron. Chỉ cần sửa `airdrops.json` thỉnh thoảng là đủ, hoặc vào Actions bật lại.

## 4. Thêm / sửa kèo

**Cách 1: sửa `airdrops.json` trên GitHub** (nên dùng, vì bot cũng thấy)

```json
{
  "id": "ten-kebo-moi",
  "name": "Tên dự án",
  "chain": "Mạng gì",
  "type": "Testnet",
  "status": "farm",
  "prio": "high",
  "daily": ["Faucet", "Swap 1 lần"],
  "once": ["Kết nối ví", "Follow X"],
  "web": "https://...",
  "x": "https://x.com/...",
  "note": "Ghi chú"
}
```

- `status`: `farm` (đang farm) · `wait` (chờ TGE) · `claim` (claim được) · `sold` (đã bán) · `drop` (bỏ)
- `prio`: `high` · `mid` · `low`
- Commit xong, web tự deploy lại. Kèo mới sẽ tự hiện khi bạn mở web.

**Cách 2: bấm "+ Thêm kèo" ngay trên web.** Cách này nhanh, nhưng kèo chỉ lưu trên trình duyệt đó và bot Telegram không thấy.

## 5. Nhờ Claude viết tool / đề xuất kèo

- Trên mỗi kèo đang farm có nút **🤖 Nhờ viết tool**, còn trên đầu trang có nút **💡 Đề xuất kèo**. Bấm vào, ghi bạn muốn gì, rồi bấm **Gửi yêu cầu**. GitHub sẽ mở sẵn một issue, bạn chỉ cần bấm **Submit**.
- Sáng thứ Hai, Claude xử lý tất cả yêu cầu và gửi **1 Pull Request**. Bạn đọc qua rồi bấm **Merge**.
- Khoảng 4h sáng hôm sau, máy nhà tự `git pull`, thấy tool mới thì tự tạo lịch chạy. Có Telegram thì bạn sẽ nhận được tin báo.

## 6. Chạy thử trên máy

```bash
# Xem tin nhắn bot sẽ gửi (không gửi thật)
DRY_RUN=1 node scripts/remind.mjs

# Mở web: cần một server tĩnh vì trang đọc airdrops.json
npx serve .
```

## Dữ liệu lưu ở đâu?

- **Tiến độ tick, ví, số tiền đã bán** chỉ lưu trong trình duyệt (localStorage). Đổi máy hoặc xoá dữ liệu trình duyệt là mất, nên thỉnh thoảng bấm **Copy dữ liệu (JSON)** để sao lưu, rồi **Nhập dữ liệu** khi sang máy khác.
- **Danh sách kèo gốc** nằm ở `airdrops.json` trong repo.

## An toàn

- Chỉ lưu **địa chỉ ví công khai**. Web sẽ chặn nếu bạn lỡ dán seed phrase hoặc private key.
- Dùng ví riêng để farm, không dùng ví chính.
- Chỉ lấy link từ tài khoản X chính thức của dự án. Link "claim" gửi qua DM hay comment gần như chắc chắn là lừa đảo.
- Testnet và points **không đảm bảo** có airdrop.
