# MMO Market – Sàn giao dịch sản phẩm MMO

Sàn thương mại nhiều người bán chuyên sản phẩm & dịch vụ MMO: tài khoản, tool, proxy, key, khoá học, dịch vụ thuê làm… Tiền mua hàng luôn đi qua **ký quỹ (escrow)**, hàng số được **mã hoá** và giao tự động, có **chợ yêu cầu** (đăng bài cần tìm, bình luận, báo giá), **chat realtime** với người bán và **hỗ trợ trực tuyến** với admin.

| Thành phần | Địa chỉ khi chạy trên máy | Công nghệ |
|---|---|---|
| Web người mua + Seller Center | http://localhost:3000 | Next.js 15, React 19, Tailwind 4 |
| Trang quản trị | http://localhost:3001 | Next.js 15 |
| API + realtime | http://localhost:4000/api | NestJS 11, Prisma 6, Socket.IO |
| Hộp thư thử nghiệm | http://localhost:8025 | Mailpit (xem email xác minh, thông báo) |
| CSDL / bộ nhớ đệm | localhost:5432 / 6379 | PostgreSQL 16, Redis 7 |

Bộ tài liệu thiết kế đầy đủ (chức năng, luồng nghiệp vụ, cơ sở dữ liệu, bảo mật, lộ trình) nằm trong thư mục [`docs/`](./docs/README.md).

---

## Cách 1 – Chạy bằng Docker (khuyên dùng, Windows / macOS / Linux)

Chỉ cần cài **Docker Desktop** (https://www.docker.com/products/docker-desktop). Không cần cài Node.js hay PostgreSQL.

```bash
# 1. Giải nén file zip, mở Terminal / PowerShell trong thư mục mmo-market
cd mmo-market

# 2. Build và chạy toàn bộ (lần đầu mất khoảng 5–10 phút)
docker compose up -d --build

# 3. Xem tiến trình khởi động API (migration + tạo dữ liệu mẫu)
docker compose logs -f api
```

Khi log hiện `Khởi động API trên cổng 4000`, mở:

- Web: http://localhost:3000
- Admin: http://localhost:3001
- Email thử nghiệm: http://localhost:8025

Lệnh hay dùng:

```bash
docker compose ps              # xem trạng thái
docker compose down            # dừng (giữ dữ liệu)
docker compose down -v         # dừng và XOÁ toàn bộ dữ liệu (lần sau chạy sẽ tạo lại dữ liệu mẫu)
docker compose up -d --build   # chạy lại sau khi sửa mã nguồn
```

> Nếu báo trùng cổng (5432, 6379, 3000…), hãy tắt PostgreSQL/Redis/ứng dụng khác đang chạy trên máy, hoặc sửa phần `ports` trong `docker-compose.yml`.

## Cách 2 – Chạy bằng Node.js (để phát triển, sửa code thấy ngay)

Yêu cầu: **Node.js 20.11+** (khuyên dùng 22 LTS), **PostgreSQL 16**, **Redis 7**.

Cách dễ nhất là dùng Docker chỉ cho CSDL, còn ứng dụng chạy bằng Node:

```bash
cd mmo-market
npm install              # cài thư viện cho cả 4 phần (api, web, admin, ui)
npm run infra:up         # bật PostgreSQL + Redis + Mailpit bằng Docker
npm run setup            # tạo file .env (bí mật ngẫu nhiên) + tạo bảng + dữ liệu mẫu
npm run dev              # chạy API, web, admin cùng lúc (tự tải lại khi sửa code)
```

<details>
<summary>Không dùng Docker: tự cài PostgreSQL và Redis</summary>

1. Cài PostgreSQL 16, rồi tạo người dùng và CSDL (mở `psql` bằng tài khoản postgres):
   ```sql
   CREATE USER mmo WITH PASSWORD 'mmo_dev_password';
   CREATE DATABASE mmo_market OWNER mmo;
   ```
2. Cài Redis 7 và đặt mật khẩu `redis_dev_password` (dòng `requirepass redis_dev_password` trong `redis.conf`).
   - **Windows**: Redis không có bản chính thức, hãy dùng [Memurai](https://www.memurai.com/) hoặc chạy Redis trong WSL2.
   - **macOS**: `brew install postgresql@16 redis`.
   - **Ubuntu/Debian**: `sudo apt install postgresql redis-server`.
3. Nếu dùng mật khẩu/cổng khác, sửa `DATABASE_URL` và `REDIS_URL` trong file `.env` sau khi chạy `npm run setup -- --env-only`.
4. Chạy `npm run setup` rồi `npm run dev`.

</details>

Các lệnh khác:

| Lệnh | Tác dụng |
|---|---|
| `npm run db:reset` | Xoá sạch CSDL, tạo lại bảng và dữ liệu mẫu |
| `npm run build` rồi `npm start` | Chạy bản production trên máy |
| `npm run typecheck` | Kiểm tra kiểu TypeScript toàn bộ dự án |
| `npm test` | Kiểm thử đơn vị phần bảo mật lõi (2FA, mã hoá, mật khẩu, VietQR…) |
| `npm run test:e2e` | Kiểm thử luồng chính qua API thật (cần API đang chạy với CSDL vừa tạo bằng `npm run db:reset`) |
| `npm run gen:secrets` | Sinh bộ bí mật ngẫu nhiên cho môi trường thật |

---

## Tài khoản dùng thử

Mật khẩu chung cho mọi tài khoản mẫu: **`MatKhau@2026`**

| Vai trò | Email đăng nhập |
|---|---|
| Super Admin | `admin@mmo.local` |
| Kế toán (2 người, để thử duyệt 4 mắt) | `ketoan@mmo.local`, `ketoan2@mmo.local` |
| Chăm sóc khách hàng | `cskh@mmo.local` |
| Kiểm duyệt nội dung | `kiemduyet@mmo.local` |
| Người bán (6 gian hàng) | `shopgmail@mmo.local`, `proxyviet@mmo.local`, `aitools@mmo.local`, `keygame@mmo.local`, `designstudio@mmo.local`, `mmoacademy@mmo.local` |
| Người mua | `buyer1@mmo.local` … `buyer10@mmo.local` (buyer8 có hồ sơ người bán đang chờ duyệt) |

**Xác thực 2 lớp (2FA)** – cài sẵn ứng dụng Google Authenticator, Microsoft Authenticator hoặc Authy trên điện thoại:

- **Admin / nhân sự**: lần đăng nhập đầu tiên bắt buộc quét mã QR để bật 2FA, sau đó lưu 10 mã khôi phục.
- **Người bán**: vào Seller Center sẽ được yêu cầu bật 2FA (Tài khoản → Bảo mật). Muốn rút tiền cần đặt thêm **mã PIN giao dịch** 6 số.

## Thử nhanh các tính năng

1. **Mua hàng giao tự động**: đăng nhập `buyer1` → chọn một sản phẩm có nhãn *Tự động* → Mua ngay → mở đơn hàng, bấm *Xem hàng* để giải mã tài khoản/key nhận được.
2. **Nạp tiền**: Ví → Nạp tiền → hiện mã VietQR. Ở chế độ chạy thử có nút **"Giả lập đã chuyển khoản"** để cộng tiền ngay mà không cần chuyển thật.
3. **Khiếu nại**: trong đơn đang bảo hành bấm *Khiếu nại* → đăng nhập người bán xử lý ở *Seller Center → Khiếu nại* (đổi item / hoàn tiền / từ chối) → nếu không đồng ý, người mua chuyển lên admin phân xử.
4. **Chợ yêu cầu**: *Chợ yêu cầu → Đăng yêu cầu* → người bán vào bình luận, trả lời bình luận và gửi báo giá → người mua chấp nhận báo giá, hệ thống tạo đơn và giữ tiền ký quỹ.
5. **Chat & hỗ trợ**: nút *Nhắn tin* ở trang sản phẩm/gian hàng để chat với người bán; nút *Hỗ trợ* góc phải màn hình để nhắn admin → admin trả lời realtime ở trang quản trị *Hỗ trợ trực tuyến*.
6. **Bán hàng**: đăng nhập người bán → *Seller Center*: dashboard doanh thu, đăng sản phẩm với thuộc tính lọc, nhập kho hàng số (được mã hoá, chống trùng), xử lý đơn, rút tiền.
7. **Quản trị**: dashboard toàn sàn, duyệt hồ sơ người bán (KYC), duyệt sản phẩm, duyệt rút tiền, điều chỉnh số dư cần 2 người duyệt, sổ cái & đối soát, nhật ký kiểm toán, công tắc khẩn cấp.

---

## Cấu trúc mã nguồn

```
mmo-market/
├─ apps/
│  ├─ api/            NestJS – toàn bộ nghiệp vụ, bảo mật, realtime, tác vụ định kỳ
│  │  ├─ prisma/      schema.prisma, migrations, seed.ts (dữ liệu mẫu)
│  │  ├─ src/common/  xác thực, phiên, CSRF, giới hạn tần suất, mã hoá, nhật ký kiểm toán
│  │  ├─ src/modules/ auth, catalog, search, products, orders, wallet, ledger, disputes,
│  │  │               board (chợ yêu cầu), chat, reports, analytics, admin, jobs…
│  │  └─ test/        kiểm thử đơn vị
│  ├─ web/            Next.js – trang người mua + Seller Center (/seller)
│  └─ admin/          Next.js – trang quản trị
├─ packages/ui/       Thành phần giao diện & biểu đồ dùng chung
├─ tests/e2e/         Kiểm thử luồng chính (race condition, webhook, sổ cái…)
├─ docker/            Dockerfile + script khởi động API
├─ docs/              Tài liệu thiết kế
└─ docker-compose.yml
```

## Bảo mật đã tích hợp

- **Đăng nhập**: mật khẩu băm argon2id + pepper, khoá tạm khi sai nhiều lần, phiên lưu phía máy chủ (cookie HttpOnly, SameSite, `__Host-` khi chạy HTTPS), 2FA TOTP chống dùng lại mã, mã khôi phục, xác thực lại 2FA cho thao tác nhạy cảm, PIN giao dịch khi rút tiền.
- **Chống tấn công web**: CSRF double-submit + kiểm tra Origin, CSP có nonce, Helmet, giới hạn tần suất theo IP/người dùng (Redis), kiểm tra quyền sở hữu mọi tài nguyên (không đoán ID được), làm sạch Markdown, ảnh tải lên được nén lại & xoá EXIF.
- **Tiền**: sổ cái kép bất biến (trigger CSDL chặn sửa/xoá, mỗi giao dịch phải cân Nợ = Có), số dư không thể âm, khoá idempotency chống trừ tiền 2 lần, `FOR UPDATE SKIP LOCKED` chống bán trùng hàng, webhook ngân hàng ký HMAC + chống phát lại, rút tiền lớn cần 2 người, đối soát tự động hằng ngày.
- **Dữ liệu nhạy cảm**: hàng số mã hoá AES-256-GCM theo lô (envelope encryption), số tài khoản ngân hàng & bí mật 2FA được mã hoá, email bị che với nhân sự; mọi lần xem dữ liệu nhạy cảm phải nhập lý do và được ghi **nhật ký kiểm toán dạng chuỗi hash** (sửa một dòng là phát hiện được).
- **Phân quyền admin**: vai trò & quyền chi tiết, bắt buộc 2FA, có thể giới hạn IP, công tắc khẩn cấp tạm dừng đặt hàng / nạp / rút / đăng ký / chat.

---

## Đưa lên production (chạy thật)

Cấu hình mặc định chỉ để **chạy thử trên máy**. Trước khi mở cho người dùng thật, bắt buộc:

1. Tạo file `.env` cạnh `docker-compose.yml`, chạy `npm run gen:secrets` (hoặc `node scripts/gen-secrets.mjs`) và dán các giá trị sinh ra: `MASTER_KEY`, `PAYMENT_WEBHOOK_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`.
   **Sao lưu `MASTER_KEY` ở nơi an toàn, ngoại tuyến** – mất khoá này thì không giải mã được kho hàng, 2FA và số tài khoản.
2. Đặt `APP_ENV=production` (API sẽ từ chối khởi động nếu còn bí mật dev), `SEED_DEMO=false`, `ENABLE_DEV_TOOLS=false`.
   Lần chạy đầu, log API in ra **mật khẩu tạm của Super Admin** (chỉ một lần) – đăng nhập, bật 2FA và đổi mật khẩu ngay. Có thể đặt trước bằng `ADMIN_EMAIL` và `ADMIN_INITIAL_PASSWORD`.
3. Chạy sau HTTPS (Caddy, Nginx hoặc Cloudflare Tunnel), đặt `COOKIE_SECURE=true`, sửa `WEB_ORIGIN`, `ADMIN_ORIGIN`, `NEXT_PUBLIC_WS_URL` theo tên miền thật (ví dụ `https://mmomarket.vn`, `https://admin.mmomarket.vn`, `https://api.mmomarket.vn`) rồi build lại web/admin.
4. Không mở cổng PostgreSQL/Redis ra Internet. Giới hạn IP vào trang quản trị bằng `ADMIN_IP_ALLOWLIST`, giới hạn IP cổng thanh toán bằng `PAYMENT_WEBHOOK_IP_ALLOWLIST`.
5. Cấu hình thật: SMTP gửi email, tài khoản ngân hàng nhận tiền (`DEPOSIT_*`), cổng thanh toán (SePay hoặc webhook HMAC), Cloudflare Turnstile chống bot (`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), `PASSWORD_BREACH_CHECK=true`.
6. Sao lưu CSDL hằng ngày (`pg_dump`) và thư mục ảnh tải lên (volume `storage`), thử khôi phục định kỳ.
7. Đọc [docs/10 – Pháp lý & vận hành](./docs/10-phap-ly-va-van-hanh.md): chính sách hàng cấm, điều khoản, quy trình xử lý khiếu nại và rửa tiền.

## Gỡ lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `Can't reach database server` | PostgreSQL chưa chạy hoặc sai `DATABASE_URL` trong `.env` |
| `NOAUTH Authentication required` / lỗi Redis | Redis chưa đặt mật khẩu trùng `REDIS_URL` |
| Vào Seller Center báo cần 2FA | Đúng thiết kế – bật 2FA ở *Tài khoản → Bảo mật* |
| Không nhận được email xác minh | Xem tại http://localhost:8025 (Mailpit) |
| Muốn làm lại dữ liệu mẫu | Docker: `docker compose down -v` rồi `up` lại. Node: `npm run db:reset` |
