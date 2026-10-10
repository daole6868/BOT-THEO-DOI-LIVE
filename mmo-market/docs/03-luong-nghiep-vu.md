# 03. Luồng nghiệp vụ

Các sơ đồ dùng Mermaid, GitHub tự hiển thị.

---

## 1. Đăng ký và xác minh

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant W as Web
    participant A as API
    participant M as Email
    U->>W: Điền form + CAPTCHA
    W->>A: POST /auth/register
    A->>A: Kiểm tra CAPTCHA, rate limit, mật khẩu (độ mạnh + danh sách lộ)
    A->>A: Băm argon2id, tạo user (status = unverified)
    A->>M: Gửi link xác minh (token 1 lần, 30 phút)
    A-->>W: 201 (luôn trả thông điệp chung, không tiết lộ email đã tồn tại)
    U->>W: Bấm link
    W->>A: POST /auth/verify-email
    A->>A: So khớp hash token, đánh dấu đã dùng, status = active
    A-->>W: Đăng nhập + gợi ý bật 2FA
```

## 2. Đăng ký người bán (KYC)

```mermaid
stateDiagram-v2
    [*] --> Draft: Người dùng mở form
    Draft --> Pending: Nộp hồ sơ (CCCD, selfie, ngân hàng trùng tên, bật 2FA)
    Pending --> NeedMoreInfo: Admin yêu cầu bổ sung
    NeedMoreInfo --> Pending: Bổ sung
    Pending --> Approved: Admin duyệt
    Pending --> Rejected: Admin từ chối (kèm lý do)
    Rejected --> Draft: Nộp lại sau 7 ngày
    Approved --> Suspended: Vi phạm
    Suspended --> Approved: Mở khoá
    Approved --> [*]
```

**Quy tắc**
- Bắt buộc bật 2FA trước khi nộp.
- Ảnh KYC lưu ở bucket riêng tư, mã hoá, chỉ người có quyền `kyc.view` xem được, mỗi lần xem ghi audit log.
- Kiểm tra trùng: 1 CCCD chỉ gắn với 1 gian hàng; tài khoản ngân hàng đã dùng ở gian hàng bị khoá thì gắn cờ.
- Seller mới vào cấp **"Mới"**: sản phẩm phải duyệt, thời gian giữ tiền dài hơn, hạn mức rút thấp hơn.

## 3. Nạp tiền qua VietQR (tự động)

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant W as Web
    participant A as API
    participant P as Cổng thanh toán<br/>(SePay / PayOS / Casso…)
    participant B as Ngân hàng
    U->>W: Chọn "Nạp tiền", nhập số tiền
    W->>A: POST /wallet/deposits
    A->>A: Tạo deposit (pending, mã nội dung duy nhất, hết hạn 30')
    A-->>W: QR (STK sàn, số tiền, nội dung MMOxxxxxx)
    U->>B: Quét QR, chuyển khoản
    B->>P: Biến động số dư
    P->>A: Webhook (ký HMAC)
    A->>A: 1) Xác thực chữ ký + timestamp + IP nguồn
    A->>A: 2) Lưu webhook_event (unique theo mã giao dịch ngân hàng) → trùng thì bỏ qua
    A->>A: 3) Tìm deposit theo mã nội dung, so khớp số tiền
    A->>A: 4) Transaction: deposit = completed, ghi sổ cái (Nợ TK ngân hàng sàn / Có ví user)
    A-->>P: 200 OK
    A->>W: WebSocket: "Nạp thành công +500.000đ"
```

**Xử lý ngoại lệ**

| Tình huống | Cách xử lý |
|-----------|-----------|
| Chuyển sai nội dung | Giao dịch vào hàng chờ "Chưa khớp". Người dùng gửi yêu cầu kèm biên lai. Kế toán khớp thủ công (2 bước) |
| Chuyển khác số tiền | Cộng đúng số thực nhận, ghi chú. Hoặc vào hàng chờ nếu lệch quá ngưỡng cấu hình |
| Webhook đến 2 lần | Ràng buộc unique `provider + provider_txn_id` nên lần 2 bị bỏ qua |
| Webhook không đến | Job đối soát mỗi 5 phút gọi API lịch sử giao dịch của cổng để bù |
| Deposit hết hạn mà tiền vẫn về | Vẫn khớp theo mã nội dung nếu mã chưa dùng. Mã không tái sử dụng |

## 4. Mua hàng giao tự động (luồng quan trọng nhất)

```mermaid
sequenceDiagram
    actor U as Người mua
    participant A as API
    participant DB as PostgreSQL
    participant Q as Queue (BullMQ)
    U->>A: POST /orders {variant_id, qty, Idempotency-Key}
    A->>A: Kiểm tra quyền, rate limit, giá hiện tại, ngưỡng cần 2FA/PIN
    A->>DB: BEGIN
    A->>DB: SELECT ví user FOR UPDATE
    A->>DB: Kiểm tra số dư ≥ tổng tiền
    A->>DB: SELECT qty stock_items WHERE status='available'<br/>FOR UPDATE SKIP LOCKED
    alt Không đủ hàng
        A->>DB: ROLLBACK
        A-->>U: 409 Hết hàng (còn N)
    end
    A->>DB: INSERT order, order_items
    A->>DB: UPDATE stock_items SET status='sold', order_item_id=…
    A->>DB: Ghi sổ cái: Nợ ví người mua / Có TK escrow
    A->>DB: INSERT escrow_hold (release_at = now + hold_time)
    A->>DB: COMMIT
    A->>Q: Sự kiện order.paid (thông báo seller, cập nhật tồn kho search, thống kê)
    A-->>U: 201 {order_id} → trang đơn hiển thị hàng đã nhận
```

**Điểm then chốt**
- `FOR UPDATE SKIP LOCKED` cho phép nhiều người mua cùng lúc mà **không bao giờ bán trùng 1 item**.
- Khoá ví bằng `FOR UPDATE` và ràng buộc `CHECK (balance >= 0)` nên **không thể chi vượt số dư** khi gửi nhiều request song song.
- `Idempotency-Key` (UUID do client sinh): người dùng bấm 2 lần hay mạng chập chờn thì cũng chỉ tạo 1 đơn.
- Hàng chỉ được giải mã khi người mua mở trang đơn (`GET /orders/:id/items`). Mỗi lần xem ghi log.

## 5. Đơn dịch vụ (giao thủ công)

```mermaid
stateDiagram-v2
    [*] --> Paid: Thanh toán (tiền vào escrow)
    Paid --> InProgress: Seller nhận đơn
    Paid --> Cancelled: Seller từ chối / quá hạn nhận → hoàn tiền 100%
    InProgress --> Delivered: Seller bấm "Đã giao" + bằng chứng
    InProgress --> Cancelled: Quá hạn giao → người mua được hủy, hoàn 100%
    Delivered --> Completed: Người mua xác nhận / hết thời gian kiểm tra
    Delivered --> Disputed: Người mua khiếu nại
    Disputed --> Completed: Đạt thỏa thuận / admin phân xử cho seller
    Disputed --> Refunded: Admin phân xử cho người mua (toàn phần/1 phần)
    Completed --> [*]
    Refunded --> [*]
    Cancelled --> [*]
```

## 6. Trạng thái đơn hàng (chung) và giải ngân escrow

| Trạng thái | Ý nghĩa | Tiền ở đâu |
|-----------|---------|-----------|
| `paid` | Đã thanh toán | Escrow |
| `in_progress` | (Dịch vụ) seller đang làm | Escrow |
| `delivered` | Đã giao, đang trong thời gian bảo hành/kiểm tra | Escrow |
| `disputed` | Đang khiếu nại, **ngừng đồng hồ giải ngân** | Escrow (đóng băng) |
| `completed` | Hoàn tất | Đã chuyển seller (trừ phí) |
| `refunded` / `partially_refunded` | Hoàn tiền | Về ví người mua (và một phần cho seller nếu hoàn 1 phần) |
| `cancelled` | Huỷ trước khi giao | Về ví người mua |

**Thời gian giữ tiền** = `max(bảo hành của sản phẩm, hold tối thiểu theo cấp seller)`. Ví dụ cấu hình:

| Cấp seller | Hold tối thiểu | Hạn mức rút/ngày | Duyệt sản phẩm |
|-----------|---------------|------------------|----------------|
| Mới | 72 giờ | 5 triệu | Thủ công |
| Đồng | 48 giờ | 20 triệu | Thủ công (lấy mẫu) |
| Bạc | 24 giờ | 50 triệu | Tự động + hậu kiểm |
| Vàng | 12 giờ | 200 triệu | Tự động + hậu kiểm |
| Kim cương | 6 giờ | Theo thỏa thuận | Tự động + hậu kiểm |

**Job giải ngân** (chạy mỗi phút, có khoá phân tán để chỉ 1 worker chạy):
```
SELECT … FROM escrow_holds
WHERE status='holding' AND release_at <= now()
  AND order không có dispute mở
FOR UPDATE SKIP LOCKED LIMIT 500
→ với mỗi hold, trong 1 transaction:
   Nợ TK escrow (tổng) / Có ví seller (tổng - phí) / Có TK doanh thu sàn (phí)
   hold.status = 'released'; order.status = 'completed'
```

## 7. Khiếu nại

```mermaid
flowchart TD
    A[Người mua mở khiếu nại<br/>chọn item lỗi + lý do + bằng chứng] --> B{Seller phản hồi<br/>trong 12h?}
    B -- Không --> R1[Tự động hoàn tiền phần item lỗi]
    B -- Có --> C{Seller chọn}
    C -- Đổi item --> D[Lấy item mới từ kho<br/>giao lại cho người mua]
    C -- Hoàn tiền --> R2[Hoàn toàn phần / một phần]
    C -- Từ chối + bằng chứng --> E{Người mua đồng ý?}
    D --> F{Người mua hài lòng?}
    F -- Có --> G[Đóng khiếu nại<br/>escrow tiếp tục đếm]
    F -- Không --> H
    E -- Có --> G
    E -- Không / quá 24h --> H[Leo thang: Admin phân xử<br/>chat 3 bên]
    H --> I{Phán quyết}
    I -- Cho người mua --> R2
    I -- Cho seller --> G
    I -- Chia --> R2
    R1 --> Z[Ghi sổ cái, cập nhật điểm uy tín]
    R2 --> Z
    G --> Z
```

**Quy tắc**
- Chỉ mở được khiếu nại khi đơn chưa `completed` và còn trong thời gian bảo hành.
- Khiếu nại theo **từng item** (đơn 100 tài khoản, 3 cái lỗi thì khiếu nại 3 cái).
- Khi phân xử, admin xem nội dung item thì phải nhập lý do. Hành động được ghi audit.
- Mọi hạn (12h, 24h) là cấu hình. Đồng hồ hiển thị đếm ngược cho cả 2 bên.

## 8. Chợ yêu cầu: đăng bài, bình luận, báo giá, chốt đơn

```mermaid
sequenceDiagram
    actor B as Người mua
    actor S as Seller
    participant A as API
    B->>A: Đăng bài yêu cầu (danh mục, ngân sách, số lượng, hạn)
    A->>A: Lọc từ khoá cấm, rate limit, bài đầu của tài khoản mới → chờ duyệt
    A-->>S: Thông báo seller theo dõi danh mục đó
    S->>A: Bình luận hỏi thêm
    B->>A: Trả lời bình luận (parent_id)
    A-->>S: Thông báo "có người trả lời bạn"
    S->>A: Gửi báo giá (giá, thời gian, mô tả)
    A-->>B: Thông báo báo giá mới
    B->>A: Chấp nhận báo giá
    A->>A: Transaction: tạo đơn dịch vụ theo giá báo, trừ ví → escrow,<br/>offer = accepted, các offer khác = declined, bài = fulfilled
    A-->>S: Đơn mới → luồng §5
```

**Cấu trúc bình luận**: lưu dạng cây (`parent_id`, `root_id`, `depth`). Giao diện hiển thị **2 cấp**:
- Cấp 1: bình luận vào bài.
- Cấp 2: các trả lời, xếp theo thời gian.
- Trả lời một trả lời: vẫn ở cấp 2, tự chèn `@tên` người được trả lời.

Cách này giữ giao diện gọn như Facebook mà vẫn biết ai trả lời ai.

## 9. Rút tiền

```mermaid
stateDiagram-v2
    [*] --> Requested: Seller tạo lệnh (2FA + PIN)
    Requested --> OnHold: Tự động gắn cờ (TK ngân hàng mới đổi, số tiền bất thường, nạp-rút nhanh)
    OnHold --> Requested: Kế toán xác minh xong
    Requested --> Approved: Kế toán duyệt (bước 1)
    Approved --> Paid: Chuyển khoản xong + nhập mã GD ngân hàng (bước 2, người khác nếu > ngưỡng)
    Requested --> Rejected: Từ chối (tiền về ví khả dụng)
    Requested --> Cancelled: Seller tự huỷ
    Paid --> [*]
    Rejected --> [*]
    Cancelled --> [*]
```

- Khi tạo lệnh: chuyển tiền từ ví khả dụng sang trạng thái "chờ rút" (bút toán), tránh bị tiêu 2 lần.
- Chỉ rút về tài khoản ngân hàng **trùng tên KYC**.
- Đổi hoặc thêm tài khoản ngân hàng thì khoá rút 48 giờ và gửi email cảnh báo.
- Lệnh vượt ngưỡng (ví dụ 50 triệu) cần **2 nhân sự khác nhau** duyệt.

## 10. Chat hỗ trợ

```mermaid
flowchart LR
    U[Người dùng bấm Hỗ trợ] --> T[Chọn chủ đề + mô tả ngắn]
    T --> G{Giờ làm việc<br/>& có nhân viên online?}
    G -- Có --> Q[Vào hàng chờ theo chủ đề] --> AS[Gán nhân viên ít việc nhất<br/>có kỹ năng chủ đề]
    AS --> C[Hội thoại hỗ trợ]
    G -- Không --> TK[Tạo ticket + trả lời tự động<br/>'sẽ phản hồi trước 9h sáng']
    C --> E{Xong?}
    E -- Có --> CL[Đóng + khảo sát CSAT]
    E -- Cần xử lý sâu --> TK
```

- Hội thoại hỗ trợ tự **đính kèm ngữ cảnh**: mã đơn/giao dịch gần nhất, trạng thái tài khoản. Nhân viên thấy ở cột phải.
- Người dùng **không bao giờ** thấy tên đăng nhập thật của nhân viên, chỉ thấy tên hiển thị như "Hỗ trợ viên Lan".
- Hệ thống luôn hiển thị nhắc nhở: **"Nhân viên không bao giờ hỏi mật khẩu, mã 2FA hay yêu cầu chuyển khoản riêng."**

## 11. Báo cáo vi phạm và kiểm duyệt

1. Người dùng bấm "Báo cáo" trên sản phẩm, bài, bình luận, tin nhắn, người dùng hoặc gian hàng, rồi chọn lý do.
2. Báo cáo vào hàng chờ của mod, gom các báo cáo trùng đối tượng. Từ N báo cáo trở lên thì tự ẩn tạm thời.
3. Mod xử lý: bỏ qua / ẩn / xoá / cảnh cáo / khoá tạm / khoá vĩnh viễn / giữ tiền (cần quyền admin).
4. Người bị xử lý nhận thông báo kèm lý do và có thể kháng nghị 1 lần.
