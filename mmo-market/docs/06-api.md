# 06. Thiết kế API và sự kiện realtime

## 1. Quy ước chung

| Mục | Quy ước |
|-----|---------|
| Base URL | `https://mmomarket.vn/api/v1` (web) · `https://admin.mmomarket.vn/api/admin/v1` (admin, chỉ truy cập qua VPN/Access) |
| Định dạng | JSON, `camelCase` trong API, `snake_case` trong DB |
| Xác thực | Cookie phiên `__Host-sid` (HttpOnly, Secure, SameSite=Lax, Path=/). Seller API (P3) dùng `Authorization: Bearer <api_key>` có scope |
| CSRF | Header `X-CSRF-Token` cho mọi request thay đổi dữ liệu + kiểm tra `Origin` |
| Idempotency | Header `Idempotency-Key: <uuid>` **bắt buộc** cho: tạo đơn, nạp, rút, chấp nhận báo giá, giải quyết khiếu nại, điều chỉnh số dư |
| Phân trang | Cursor: `?cursor=<opaque>&limit=20` → `{ data, nextCursor }`. Bảng admin dùng `page/pageSize` + `total` |
| Lọc & sắp xếp | `?filter[status]=paid&filter[createdFrom]=…&sort=-createdAt` |
| Lỗi | `{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "Số dư không đủ", "details": {…}, "requestId": "…" } }` |
| Mã HTTP | 200/201, 400 validate, 401 chưa đăng nhập, 403 không có quyền, 404 (cũng dùng khi không có quyền xem để **không lộ tồn tại**), 409 xung đột (hết hàng, trạng thái sai), 422 nghiệp vụ, 429 rate limit |
| Step-up | Hành động nhạy cảm trả `403 { code: "MFA_REQUIRED" }`, client hiện hộp nhập 2FA/PIN rồi gọi `/auth/step-up` và thử lại |
| Tài liệu | OpenAPI 3.1 sinh tự động từ NestJS. SDK TypeScript sinh từ OpenAPI (`packages/sdk`) |
| Version | Đổi không tương thích thì lên `/v2`. Field mới luôn optional |

## 2. Endpoint chính (web)

### Auth

```
POST   /auth/register                 {email, username, password, turnstileToken}
POST   /auth/verify-email             {token}
POST   /auth/login                    {login, password, turnstileToken?} → {mfaRequired?}
POST   /auth/login/mfa                {code | recoveryCode}
POST   /auth/logout
POST   /auth/password/forgot          {email}            (luôn 200)
POST   /auth/password/reset           {token, newPassword}
POST   /auth/step-up                  {code, pin?}       → đánh dấu phiên đã xác minh lại 10 phút
GET    /auth/sessions                 | DELETE /auth/sessions/:id | DELETE /auth/sessions (tất cả trừ hiện tại)
POST   /auth/mfa/setup                → {otpauthUrl, qrSvg}   POST /auth/mfa/enable {code}   POST /auth/mfa/disable {code}
POST   /auth/pin                      {pin, currentPassword}
GET    /me                            | PATCH /me
```

### Danh mục, sản phẩm, tìm kiếm

```
GET    /categories                    (cây, có cache CDN 5 phút)
GET    /categories/:slug              → {category, attributes(filters), breadcrumbs}
GET    /search/products               ?q=&category=&price[min]=&price[max]=&delivery=auto&inStock=1
                                      &ratingMin=4&sellerLevel=gold&attrs[country]=VN&attrs[has_2fa]=true
                                      &sort=best_selling&cursor=
                                      → {data, facets:{country:{VN:120,US:44}, has_2fa:{true:1204}}, total, nextCursor}
GET    /search/suggest                ?q=gma → {products[], stores[], categories[]}
GET    /products/:storeSlug/:productSlug
GET    /products/:id/reviews          ?rating=5&withImages=1
GET    /stores/:slug                  | GET /stores/:slug/products | POST/DELETE /stores/:slug/follow
```

### Đơn hàng và ví

```
POST   /orders                        {variantId, qty, couponCode?, buyerInput?}   [Idempotency-Key]
GET    /orders                        ?status=&cursor=
GET    /orders/:code
GET    /orders/:code/items            → nội dung đã giải mã (log mỗi lần xem, rate limit)
GET    /orders/:code/items.txt        → tải file
POST   /orders/:code/confirm          (người mua xác nhận hài lòng → giải ngân sớm)
POST   /orders/:code/cancel           (đơn dịch vụ chưa nhận)
POST   /orders/:code/disputes         {reason, itemIds[], description, attachmentIds[]}
GET    /disputes/:id                  | POST /disputes/:id/events {message, attachmentIds[]}
POST   /disputes/:id/accept           | POST /disputes/:id/escalate
POST   /orders/:code/review           {rating, content, imageIds[]}

GET    /wallet                        → {available, held, pendingWithdrawal}
GET    /wallet/transactions           ?type=&cursor=
POST   /wallet/deposits               {amount} → {code, qrImage, bankInfo, expiresAt}   [Idempotency-Key]
GET    /wallet/deposits/:code         (poll dự phòng khi không có websocket)
POST   /wallet/deposits/manual-claim  {amount, transferTime, receiptImageId}
GET    /wallet/bank-accounts          | POST (step-up) | DELETE /:id (step-up)
POST   /wallet/withdrawals            {bankAccountId, amount}   [Idempotency-Key, step-up]
GET    /wallet/withdrawals            | POST /wallet/withdrawals/:code/cancel
```

### Chợ yêu cầu

```
GET    /requests                      ?category=&budgetMin=&budgetMax=&status=open&sort=newest|most_offers|ending_soon
POST   /requests                      {title, categoryId, bodyMd, budgetMin, budgetMax, quantity, deadlineAt, offerVisibility}
GET    /requests/:id                  | PATCH /requests/:id | POST /requests/:id/close | POST /requests/:id/extend
GET    /requests/:id/comments         ?cursor=  → bình luận gốc + 3 trả lời mới nhất mỗi nhánh
GET    /comments/:id/replies          ?cursor=
POST   /requests/:id/comments         {body, parentId?}       (parentId → trả lời; server tự gán root_id, reply_to_user_id)
PATCH  /comments/:id                  | DELETE /comments/:id | POST/DELETE /comments/:id/like
GET    /requests/:id/offers           (chủ bài thấy đủ; người khác thấy số lượng hoặc đầy đủ nếu offerVisibility=public)
POST   /requests/:id/offers           {price, deliveryHours, message, productId?}   (chỉ seller)
PATCH  /offers/:id                    | POST /offers/:id/withdraw
POST   /offers/:id/accept             [Idempotency-Key] → tạo đơn
```

### Chat, hỗ trợ, thông báo, báo cáo

```
GET    /conversations                 ?type=direct|support&cursor=
POST   /conversations                 {type:'direct', peerUserId, context:{type:'product', id}} → trả hội thoại có sẵn nếu đã tồn tại
GET    /conversations/:id/messages    ?before=<msgId>&limit=30
POST   /conversations/:id/messages    (dự phòng khi WS lỗi)
POST   /uploads/presign               {purpose:'chat'|'product'|'review'|'dispute'|'kyc', mime, size} → {uploadUrl, uploadId}
POST   /support/conversations         {topic, message}
POST   /support/tickets               | GET /support/tickets | GET /support/tickets/:code
GET    /notifications                 | POST /notifications/read {ids[] | all}
PUT    /notifications/preferences
POST   /reports                       {targetType, targetId, reason, detail}
POST   /users/:id/block               | DELETE /users/:id/block
```

### Seller Center (`/seller/*`, yêu cầu là chủ/nhân viên gian hàng)

```
GET    /seller/dashboard              ?range=7d|30d|90d → {kpis, revenueSeries, ordersByStatus, topProducts, todo}
GET    /seller/products               | POST | PATCH /:id | POST /:id/duplicate | POST /bulk {ids[], action}
POST   /seller/variants/:id/stock     {lines: string} hoặc {uploadId}  → {accepted, duplicatesInBatch, duplicatesExisting, invalid[]}
GET    /seller/variants/:id/stock     ?status=available (chỉ hiện 4 ký tự đầu + ẩn phần còn lại)
DELETE /seller/stock/:id              (chỉ item chưa bán → status revoked)
GET    /seller/orders                 ?status=&q=&from=&to= | GET /seller/orders/:code
POST   /seller/orders/:code/accept    | POST /seller/orders/:code/deliver {note, attachmentIds[]}
GET    /seller/disputes               | POST /seller/disputes/:id/respond {action:'replace'|'refund'|'reject', amount?, message}
GET    /seller/finance/summary        | GET /seller/finance/escrow?releaseFrom=&releaseTo=
GET    /seller/reviews                | POST /seller/reviews/:id/reply
GET    /seller/offers                 | GET /seller/analytics/products ?range=
PATCH  /seller/store                  | POST /seller/store/vacation
POST   /seller/api-keys               (P3) | DELETE /seller/api-keys/:id
```

## 3. Admin API (`/api/admin/v1`)

Mọi endpoint kiểm tra **permission** cụ thể. Mọi thao tác ghi đều ghi `audit_logs`. Hành động nhạy cảm cần `reason` và step-up.

```
GET    /dashboard                     ?range= → KPI, chuỗi thời gian, hàng chờ (đếm), cảnh báo
GET    /users  | GET /users/:id (hồ sơ 360°) | POST /users/:id/lock | /unlock | /ban {reason}
POST   /users/:id/mfa-reset           {reason}  [perm: user.mfa_reset, 2 người duyệt]
GET    /seller-applications           ?status=pending | POST /:id/approve | /reject {reason} | /request-info {message}
GET    /kyc-documents/:id/view        → signed URL 60 giây [perm: kyc.view, audit]
PATCH  /stores/:id                    {level?, feeOverrideBps?, status?} {reason}
CRUD   /categories, /categories/:id/attributes, PATCH /categories/reorder
GET    /products?status=pending_review | POST /products/:id/approve | /block {reason}
GET    /orders | GET /orders/:code (dòng thời gian đầy đủ)
GET    /orders/:code/items/reveal     {reason} [perm: stock.view_content, audit]
GET    /disputes?status=escalated&sort=sla | POST /disputes/:id/assign | POST /disputes/:id/resolve {resolution, refundAmount, note} [Idempotency-Key]
GET    /deposits?status=manual_review | POST /deposits/:id/match {userId, amount, reason}  [2 bước]
GET    /withdrawals?status=requested  | POST /withdrawals/:id/approve | /mark-paid {bankRef} | /reject {reason} | /hold {reason}
POST   /ledger/adjustments            {userId, amount, direction, reason} → chờ duyệt | POST /ledger/adjustments/:id/approve (người khác)
GET    /ledger/transactions | GET /ledger/reconciliation?date=
GET    /reports?status=open | POST /reports/:id/action {action, note}
GET    /requests | /comments?reported=1 | POST /:type/:id/hide
CRUD   /banned-keywords, /banners, /pages, /posts
GET    /support/inbox | POST /support/conversations/:id/assign | /resolve | CRUD /canned-replies
CRUD   /staff, /roles   [perm: iam.manage]
GET    /audit-logs    ?actor=&action=&target=&from=&to=
GET    /settings | PUT /settings/:key  {value, reason} [perm: settings.manage, step-up]
POST   /kill-switch   {feature:'withdrawals'|'registration'|'orders'|'chat', enabled, reason}  [perm: super_admin]
GET    /fraud/alerts  | POST /fraud/alerts/:id/resolve
```

## 4. Webhook vào

```
POST /api/v1/webhooks/payments/:provider
  - Chỉ chấp nhận IP trong danh sách của nhà cung cấp (kiểm tra cả ở Cloudflare WAF)
  - Xác thực chữ ký HMAC-SHA256 trên raw body (so sánh constant-time)
  - Từ chối nếu timestamp lệch > 5 phút
  - Lưu payment_webhook_events trước (unique provider_txn_id), xử lý trong transaction, trả 200 nhanh
```

## 5. Sự kiện WebSocket (Socket.IO, namespace `/rt`)

| Hướng | Sự kiện | Payload | Ghi chú |
|------|---------|---------|---------|
| C→S | `message:send` | `{conversationId, clientMsgId, kind, body?, attachmentIds?, card?}` | ack `{id, createdAt}` hoặc `{error}` |
| C→S | `message:read` | `{conversationId, upToId}` | |
| C→S | `typing` | `{conversationId, isTyping}` | throttle 3s, không lưu |
| C→S | `presence:ping` | `{}` | 30s một lần |
| S→C | `message:new` | `{conversationId, message}` | |
| S→C | `message:read` | `{conversationId, userId, upToId}` | |
| S→C | `message:warning` | `{conversationId, messageId, type:'off_platform'}` | hiện banner cảnh báo |
| S→C | `typing` | `{conversationId, userId, isTyping}` | |
| S→C | `notification:new` | `{notification}` + `unreadCount` | |
| S→C | `wallet:updated` | `{available, held}` | sau nạp, mua, giải ngân |
| S→C | `deposit:completed` | `{code, amount}` | đóng popup QR |
| S→C | `order:updated` | `{code, status}` | |
| S→C | `stock:updated` | `{variantId, available}` | trang sản phẩm đang mở |
| S→C (staff) | `support:queued` / `support:assigned` | `{conversationId, topic, waitSec}` | admin inbox |
| S→C (admin) | `admin:metric` | `{ordersToday, gmvToday, online}` | dashboard realtime, 10s/lần |

**Bảo mật socket**: xác thực bằng cookie phiên khi handshake, kiểm tra `Origin`, tối đa 5 kết nối/người dùng, rate limit theo sự kiện (ví dụ `message:send` 20/10 giây), mọi sự kiện đều kiểm tra lại quyền thành viên hội thoại ở server.
