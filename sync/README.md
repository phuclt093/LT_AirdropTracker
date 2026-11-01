# ☁️ Đồng bộ tiến độ theo ví MetaMask

Đăng nhập web bằng MetaMask để **máy nào cũng thấy cùng một tiến độ**: việc đã tick, các bước hướng dẫn, ví farm, số tiền đã bán.

## Cách hoạt động
- Bấm **🔐 Đăng nhập bằng MetaMask**, MetaMask sẽ hiện một **tin nhắn văn bản** để bạn ký. Ký tin nhắn **không chuyển tiền và không tốn gas**, nó chỉ chứng minh bạn là chủ ví.
- Một Cloudflare Worker nhỏ (gói **miễn phí**) kiểm tra chữ ký rồi cấp phiên đăng nhập 30 ngày. Sau đó tiến độ tự lưu lên Cloudflare theo địa chỉ ví.
- Dữ liệu lưu lên chỉ là tiến độ tracker (giống phần đang lưu trên trình duyệt). **Không có private key**, và worker cũng không bao giờ yêu cầu key.
- Lần đầu đăng nhập trên một máy, tiến độ của máy đó được **gộp** với tiến độ đã lưu theo ví, không bên nào bị mất. Sau đó máy nào sửa sau cùng thì bản đó được giữ. Quay lại tab là web tự tải bản mới nhất.

## Cài đặt (1 lần, khoảng 3 phút)
Cần tài khoản Cloudflare. Bạn đã dùng Cloudflare cho ChipmunkT rồi nên dùng luôn tài khoản đó.

```bash
cd ~/Projects/LT_AirdropTracker/sync
bash setup.sh
```
Script sẽ tự làm lần lượt: cài thư viện → đăng nhập Cloudflare (mở trình duyệt, chỉ hỏi nếu chưa đăng nhập) → tạo kho KV → tạo khoá bí mật → deploy worker → ghi URL worker vào `airdrops.json`.

Xong thì đẩy lên GitHub:
```bash
cd ~/Projects/LT_AirdropTracker && git add . && git commit -m "Bật đồng bộ theo ví" && git push
```

## Dùng
1. Mở web, bấm **🔐 Đăng nhập bằng MetaMask**.
2. MetaMask hỏi **Connect** thì bấm Connect. Hiện tin nhắn "…muốn bạn đăng nhập Airdrop Tracker…" thì bấm **Ký / Sign**.
3. Góc trên hiện **☁️ 0x12…ab** là đã đồng bộ. Sang máy khác cũng làm y như vậy.

> ⚠️ Chỉ ký tin nhắn khi trên đó ghi đúng tên miền `phuclt093.github.io` và có dòng "KHÔNG chuyển tiền, KHÔNG tốn gas". Nếu MetaMask hiện **giao dịch** (có số tiền, có phí gas) hoặc yêu cầu **approve token** thì đó không phải web này, hãy bấm **Từ chối**.

## Chi phí
Gói miễn phí của Cloudflare Workers và KV dư sức cho 1 người dùng (100.000 lượt đọc/ngày, 1.000 lượt ghi/ngày; web gom nhiều cú tick liền nhau thành 1 lần ghi).

## Gỡ
`npx wrangler delete` trong thư mục `sync/`, rồi xoá giá trị `syncApi` trong `airdrops.json`. Web quay về chỉ lưu trên trình duyệt.
