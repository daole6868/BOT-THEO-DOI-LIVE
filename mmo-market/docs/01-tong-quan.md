# 01. Tổng quan, phạm vi và mô hình kinh doanh

## 1. Mục tiêu sản phẩm

Xây dựng một **sàn giao dịch nhiều người bán** cho sản phẩm và dịch vụ số phục vụ người làm MMO, với 4 trụ cột:

1. **Chợ (Marketplace)**: ai cũng mở được gian hàng, đăng sản phẩm, quản lý kho hàng số và đơn hàng.
2. **Chợ yêu cầu (Request Board)**: người mua đăng nhu cầu ("Cần mua 50 tài khoản X", "Cần người setup tool Y"). Người bán bình luận, báo giá, chốt đơn ngay trên bài.
3. **Giao tiếp**: chat trực tiếp người mua và người bán, chat với bộ phận hỗ trợ/admin.
4. **Niềm tin**: ký quỹ (escrow), bảo hành, khiếu nại, đánh giá, cấp độ uy tín người bán, bảo mật nhiều lớp.

## 2. Vai trò người dùng

| Vai trò | Mô tả | Quyền chính |
|---------|-------|-------------|
| **Khách** (chưa đăng nhập) | Người xem | Xem sản phẩm, gian hàng, bài yêu cầu, bình luận. Không mua, không bình luận, không chat |
| **Người mua** (Buyer) | Tài khoản đã xác minh email | Nạp tiền, mua hàng, đăng bài yêu cầu, bình luận, chat, đánh giá, khiếu nại |
| **Người bán** (Seller) | Người mua đã đăng ký bán và được duyệt (KYC) | Mọi quyền người mua, cộng thêm: mở gian hàng, đăng sản phẩm, quản lý kho, xử lý đơn, báo giá, rút tiền |
| **Nhân viên gian hàng** (Store Staff, P3) | Do seller mời | Quyền con do seller cấp: chỉ xử lý đơn, chỉ chat, chỉ nhập kho… |
| **Hỗ trợ viên** (Support) | Nhân sự sàn | Trả lời ticket/chat hỗ trợ, xem đơn liên quan, xử lý khiếu nại cấp 1 |
| **Kiểm duyệt viên** (Moderator) | Nhân sự sàn | Duyệt sản phẩm, bài đăng, bình luận bị báo cáo, khoá nội dung |
| **Kế toán** (Finance) | Nhân sự sàn | Duyệt rút tiền, đối soát nạp tiền, xem báo cáo tài chính |
| **Admin** | Quản trị | Quản lý người dùng, seller, danh mục, cấu hình, xử lý khiếu nại cấp 2 |
| **Super Admin** | Chủ sàn | Mọi quyền, bao gồm phân quyền nhân sự, cấu hình phí, công tắc khẩn cấp |

> Phân quyền dùng **RBAC chi tiết theo permission** (ví dụ `withdrawal.approve`, `user.ban`, `stock.view_content`), không cố định theo vai trò. Xem [07 – Bảo mật §2](./07-bao-mat.md).

## 3. Mô hình doanh thu

| Nguồn thu | Cách tính | Ghi chú |
|-----------|-----------|---------|
| **Phí giao dịch (hoa hồng)** | % trên mỗi đơn hoàn tất, cấu hình theo danh mục (ví dụ 3–10%) | Nguồn thu chính. Trừ khi giải ngân escrow |
| **Gói gian hàng** | Gói tháng (Cơ bản / Pro / VIP): giảm phí %, thêm slot sản phẩm, huy hiệu | P3 |
| **Đẩy tin / Top danh mục** | Trả phí để sản phẩm hoặc bài báo giá lên đầu trong X giờ | P3 |
| **Quảng cáo banner** | Bán vị trí banner trang chủ/danh mục | P3 |
| **Phí rút tiền** | Cố định mỗi lần rút hoặc miễn phí trên ngưỡng | Cân nhắc, có thể miễn phí để cạnh tranh |

## 4. Danh mục sản phẩm

### 4.1 Danh mục được phép (gợi ý cây danh mục cấp 1, cấp 2)

| Cấp 1 | Cấp 2 (ví dụ) | Kiểu giao hàng |
|-------|---------------|----------------|
| **Tài khoản** | Email, Mạng xã hội, Tài khoản game, Tài khoản AI/công cụ | Tự động |
| **Phần mềm & Tool** | Tool automation, Extension, Bot, Phần mềm bản quyền | Tự động (key/link) |
| **Key & Thẻ** | Key phần mềm, Key game, Gift card | Tự động |
| **Proxy, VPS, Hạ tầng** | Proxy dân cư / datacenter, VPS, Hosting, Domain | Tự động hoặc thủ công |
| **Dịch vụ MMO** | Thiết kế, Viết content, SEO, Setup quảng cáo, Lập trình theo yêu cầu, Dịch vụ mạng xã hội | Thủ công (có hạn giao) |
| **Khoá học & Tài liệu** | Khoá học, Ebook, Template, Source code | Tự động (link/file) |
| **Khác** | Danh mục mở rộng do admin tạo | Tuỳ cấu hình |

Mỗi danh mục cấp 2 có **bộ thuộc tính riêng** dùng cho bộ lọc. Ví dụ "Tài khoản mạng xã hội": nền tảng, quốc gia, năm tạo, đã xác minh SĐT hay chưa, có 2FA hay không, số bạn bè/follower. Xem [05 – CSDL §3](./05-co-so-du-lieu.md).

### 4.2 Danh mục cấm (bắt buộc ghi trong Quy chế sàn)

Sàn **phải chặn** những mặt hàng sau. Lý do: vi phạm pháp luật, hoặc rủi ro khiến sàn bị đóng cửa hoặc liên đới trách nhiệm.

- Tài khoản **bị hack, đánh cắp, chiếm đoạt**; cookie/phiên đăng nhập lấy trộm.
- Thẻ ngân hàng, thẻ tín dụng, CVV, tài khoản ngân hàng hoặc ví điện tử đứng tên người khác; dịch vụ "thuê tài khoản ngân hàng".
- **Dữ liệu cá nhân** (data khách hàng, danh sách SĐT/email, CCCD, giấy tờ tuỳ thân), SIM đã đăng ký chính chủ của người khác.
- Mã độc, công cụ phishing, ransomware, công cụ DDoS, công cụ bẻ khoá trái phép.
- Giấy tờ giả, hoá đơn giả, dịch vụ làm giả xác minh danh tính (KYC giả).
- Cờ bạc, cá độ, đa cấp, đầu tư "lợi nhuận cố định", nội dung đồi truỵ, nội dung vi phạm bản quyền rõ ràng.

**Cách thực thi:**
- Kiểm duyệt sản phẩm mới của seller mới.
- Bộ lọc từ khoá khi đăng bài.
- Nút báo cáo vi phạm.
- Khoá gian hàng và giữ tiền khi vi phạm.

> ⚠️ Nhiều sản phẩm MMO phổ biến (bán tài khoản mạng xã hội, dịch vụ tăng tương tác) **vi phạm điều khoản** của chính nền tảng đó, dù không nhất thiết vi phạm pháp luật. Chủ sàn cần tham vấn luật sư để chốt danh mục cuối cùng. Xem [10 – Pháp lý](./10-phap-ly-va-van-hanh.md).

## 5. Phạm vi theo giai đoạn

| Nhóm | MVP (Phase 1–2) | Sau MVP (Phase 3+) |
|------|-----------------|---------------------|
| Tài khoản | Đăng ký, đăng nhập, xác minh email, 2FA TOTP, quên mật khẩu, quản lý phiên | Passkey/WebAuthn, đăng nhập Google |
| Gian hàng | Mở gian hàng, KYC, trang gian hàng, thông tin, chính sách bảo hành | Gói gian hàng, nhân viên gian hàng, giao diện tuỳ chỉnh |
| Sản phẩm | Sản phẩm + biến thể (gói), kho hàng số, nhập kho hàng loạt, giao tự động/thủ công | API cho seller nhập kho, sản phẩm đặt trước |
| Danh mục & lọc | Cây danh mục, thuộc tính lọc theo danh mục, tìm kiếm có dấu/không dấu, sắp xếp | Gợi ý tìm kiếm, sản phẩm liên quan, cá nhân hoá |
| Thanh toán | Số dư ví, nạp VietQR tự động, mua bằng số dư | Mã giảm giá, cổng thanh toán thứ 2, crypto (nếu hợp pháp) |
| Đơn hàng | Escrow, bảo hành, khiếu nại, hoàn tiền | Đơn đặt theo lô, đơn định kỳ |
| Rút tiền | Rút về ngân hàng chính chủ, duyệt thủ công | Rút tự động theo ngưỡng cho seller uy tín |
| Chợ yêu cầu | Đăng bài, bình luận 2 cấp, báo giá, chốt đơn từ báo giá | Đẩy bài, bài ghim, gắn thẻ |
| Chat | Chat 1-1 người mua/người bán, chat hỗ trợ, gửi ảnh, đính kèm đơn hàng | Tin nhắn mẫu, bot trả lời tự động, chat nhóm cho đơn dịch vụ |
| Đánh giá | Sao + nhận xét sau khi đơn hoàn tất, seller phản hồi | Điểm uy tín tổng hợp, huy hiệu |
| Seller center | Dashboard doanh thu, đơn, kho, rút tiền, đánh giá | Phân tích chuyển đổi, so sánh đối thủ trong danh mục |
| Admin | Dashboard KPI, quản lý user/seller/sản phẩm/đơn/khiếu nại/nạp/rút, nhật ký | Cảnh báo gian lận tự động, báo cáo nâng cao, A/B |
| Thông báo | Trong web (chuông), email | Telegram bot, web push |

## 6. Chỉ số thành công (KPI)

| Nhóm | KPI | Mục tiêu 6 tháng sau ra mắt (tham khảo) |
|------|-----|---------------------------------------|
| Tăng trưởng | Người dùng đăng ký / Seller hoạt động | 10.000 / 300 |
| Giao dịch | GMV tháng, số đơn/ngày | Theo kế hoạch tài chính |
| Niềm tin | Tỷ lệ đơn bị khiếu nại | < 3% |
| Niềm tin | Thời gian xử lý khiếu nại trung vị | < 24 giờ |
| Vận hành | Thời gian duyệt rút tiền trung vị | < 4 giờ (giờ hành chính) |
| Chất lượng | Thời gian phản hồi chat trung vị của seller | < 15 phút |
| Kỹ thuật | Uptime | ≥ 99,9% |
| Kỹ thuật | LCP trang danh mục (4G) | < 2,5 giây |
| Bảo mật | Sự cố lộ dữ liệu / mất tiền | 0 |

## 7. Thuật ngữ

| Thuật ngữ | Nghĩa |
|-----------|-------|
| **Escrow / Ký quỹ** | Sàn giữ tiền của người mua tới khi hết thời gian bảo hành, sau đó mới chuyển cho người bán |
| **Hàng tự động** | Sản phẩm có kho dữ liệu sẵn (tài khoản, key). Hệ thống giao ngay khi thanh toán |
| **Hàng thủ công / Dịch vụ** | Người bán phải thực hiện và bấm "đã giao" trong thời hạn cam kết |
| **Stock item** | Một đơn vị hàng trong kho, ví dụ 1 dòng `user|pass|2fa` |
| **Thời gian giữ tiền (hold)** | Số giờ/ngày tiền nằm trong escrow sau khi giao, phụ thuộc cấp seller và danh mục |
| **Báo giá (Offer)** | Đề nghị của seller trả lời một bài yêu cầu, gồm giá, thời gian, mô tả. Người mua chấp nhận thì thành đơn |
| **GMV** | Tổng giá trị giao dịch |
| **KYC** | Xác minh danh tính người bán |
