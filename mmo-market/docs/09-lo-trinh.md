# 09. Lộ trình, nhân sự, chi phí và kiểm thử

## 1. Nhân sự đề xuất

| Vai trò | Số lượng | Ghi chú |
|--------|---------|---------|
| Product Owner / PM | 1 | Có thể là chủ dự án. Chốt yêu cầu, ưu tiên, nghiệm thu |
| UI/UX Designer | 1 | Toàn thời gian Phase 0–1, bán thời gian về sau |
| Backend (NestJS) | 2 | 1 người chuyên ví/sổ cái/thanh toán/bảo mật |
| Frontend (Next.js) | 2 | 1 người phía người mua + chat, 1 người Seller Center + Admin + biểu đồ |
| QA | 1 | Từ Phase 1. Viết test e2e, test bảo mật cơ bản |
| DevOps / SRE | 0,5 | Bán thời gian hoặc 1 backend kiêm. Hạ tầng, CI/CD, giám sát, sao lưu |
| Pentest bên ngoài | Thuê theo đợt | Trước khi ra mắt và sau mỗi thay đổi lớn ở ví/thanh toán |
| **Vận hành** (trước ra mắt 2 tuần) | 2–4 CSKH, 1 mod, 1 kế toán | Xem [10 – Vận hành](./10-phap-ly-va-van-hanh.md) |

> Đội nhỏ hơn (2–3 dev fullstack) vẫn làm được, nhưng thời gian nhân khoảng 1,6–2 lần và nên cắt bớt P2 khỏi đợt ra mắt.

## 2. Các giai đoạn

### Phase 0: Chuẩn bị (tuần 1–2)

| Hạng mục | Kết quả bàn giao |
|---------|------------------|
| Chốt phạm vi | Danh mục được phép/cấm, phí, thời gian giữ tiền, cấp seller (bản 1) |
| Pháp lý | Làm việc với luật sư về mô hình ví/escrow, đăng ký sàn TMĐT. Xem [10](./10-phap-ly-va-van-hanh.md) |
| Thiết kế | Wireframe toàn bộ luồng P1, design system trên Figma |
| Hạ tầng | Monorepo, Docker Compose dev, CI (lint/test/scan), staging, domain, Cloudflare, KMS |
| Cổng thanh toán | Chọn nhà cung cấp, mở tài khoản, lấy sandbox webhook |
| Kiến trúc | ERD v1, OpenAPI skeleton, quyết định quy ước code, threat model (STRIDE) cho ví và đơn hàng |

### Phase 1: MVP lõi (tuần 3–8)

| Tuần | Backend | Frontend |
|------|---------|----------|
| 3–4 | Auth (đăng ký, xác minh, đăng nhập, 2FA, phiên, rate limit), IAM, audit log, upload pipeline | Layout, design system code, trang auth, trang bảo mật tài khoản |
| 4–5 | Danh mục + thuộc tính, gian hàng + KYC, sản phẩm + biến thể, kho hàng (mã hoá, chống trùng) | Trang chủ, danh mục + bộ lọc, chi tiết sản phẩm, gian hàng, form đăng ký bán |
| 5–6 | Meilisearch + outbox sync, sổ cái kép, ví, nạp VietQR + webhook + đối soát | Tìm kiếm, gợi ý, trang ví, popup nạp QR realtime |
| 6–7 | Đặt hàng tự động (khoá, idempotency), đơn dịch vụ, escrow + job giải ngân, đánh giá | Mua ngay, trang nhận hàng, lịch sử đơn, đánh giá |
| 7–8 | Thông báo (web + email), API Seller Center cơ bản, API Admin cơ bản | Seller Center v1 (sản phẩm, kho, đơn, dashboard cơ bản), Admin v1 (duyệt seller/sản phẩm, user, đơn, nạp) |

**Tiêu chí hoàn thành Phase 1:** người dùng mới đăng ký, nạp tiền thật trên sandbox, mua hàng tự động và nhận hàng. Seller nhập kho, nhận tiền sau thời gian giữ. Admin duyệt seller và sản phẩm. Toàn bộ test race condition ví/kho pass.

### Phase 2: Cộng đồng, giao tiếp, tranh chấp (tuần 9–14)

| Hạng mục | Chi tiết |
|---------|---------|
| Chợ yêu cầu | Đăng bài, danh sách + bộ lọc, bình luận 2 cấp + @nhắc + thích, realtime, kiểm duyệt từ khoá |
| Báo giá | Gửi/sửa/rút báo giá, chấp nhận thì tạo đơn |
| Chat | WS gateway + Redis adapter, chat 1-1, thẻ ngữ cảnh, đính kèm, đã xem/đang gõ, cảnh báo ngoài sàn, chặn/báo cáo |
| Hỗ trợ | Hàng chờ chat hỗ trợ, gán nhân viên, ticket ngoài giờ, inbox admin |
| Khiếu nại | Mở theo item, seller phản hồi (đổi/hoàn/từ chối), đếm ngược, tự xử lý quá hạn, leo thang, chat 3 bên, phân xử admin |
| Rút tiền | Liên kết ngân hàng (trùng tên KYC, cooldown), lệnh rút + step-up + PIN, duyệt 2 bước, gắn cờ tự động |
| Báo cáo vi phạm | Báo cáo mọi loại đối tượng, hàng chờ mod, xử phạt, kháng nghị |
| Dashboard | Seller Center và Admin dashboard **đầy đủ** theo [08 §5, §6](./08-giao-dien-va-dashboard.md), bảng thống kê tổng hợp |

### Phase 3: Hoàn thiện và tăng trưởng (tuần 15–17)

- Cấp độ seller tự động, điểm uy tín, huy hiệu.
- Giỏ hàng nhiều gian hàng, nạp thiếu tiền rồi tiếp tục đơn.
- Mã giảm giá, chương trình giới thiệu (cơ bản).
- SEO: sitemap, schema.org, trang nội dung, blog.
- Cảnh báo gian lận (quy tắc), hồ sơ 360° admin.
- Hoàn thiện mobile, dark mode, a11y.

### Phase 4: Củng cố và ra mắt (tuần 18–21)

| Tuần | Việc |
|------|------|
| 18 | **Đóng băng tính năng**. Load test, tối ưu truy vấn, kiểm tra sao lưu/khôi phục, thử kill-switch |
| 18–19 | **Pentest bên thứ ba**, sửa lỗi high/critical, kiểm tra lại |
| 19 | Đào tạo đội vận hành theo SOP, hoàn tất văn bản pháp lý, mời 30–50 seller hạt giống nhập hàng |
| 20 | **Closed beta** (mời ~300 người dùng), theo dõi sát, sửa lỗi nhanh |
| 21 | **Ra mắt công khai**, trực 24/7 tuần đầu |

### Sau ra mắt (backlog ưu tiên)

1. Telegram bot thông báo cho seller/người mua.
2. API cho seller (nhập kho tự động, webhook đơn mới).
3. Passkey, đăng nhập Google.
4. Rút tiền tự động cho seller uy tín.
5. Đẩy tin / banner trả phí / gói gian hàng.
6. PWA (cài lên màn hình điện thoại), web push.
7. Gợi ý cá nhân hoá, sản phẩm liên quan.
8. Ứng dụng mobile (React Native), nếu số liệu cho thấy cần.

## 3. Chiến lược kiểm thử

| Loại | Công cụ | Phạm vi bắt buộc |
|-----|---------|------------------|
| Unit | Vitest | Tính giá, phí, thời gian giữ, quy tắc trạng thái đơn/khiếu nại, parser kho, sanitizer |
| Integration | Vitest + Testcontainers (Postgres, Redis) | Mọi service liên quan tiền. Sổ cái luôn cân |
| **Concurrency** | Script song song (k6 / Promise.all) | 100 lệnh mua đồng thời cùng ví. 100 người mua cùng 10 item cuối. Webhook gửi 5 lần. 2 lệnh rút đồng thời |
| **Phân quyền** | Bộ test sinh từ danh sách endpoint | Mọi endpoint × (khách, user khác, seller khác, nhân sự thiếu quyền) đều bị từ chối |
| E2E | Playwright | Đăng ký → nạp → mua → nhận → khiếu nại → hoàn. Đăng bài → bình luận → báo giá → chốt. Chat. Seller nhập kho. Admin duyệt rút |
| Load | k6 | Mục tiêu ra mắt: 300 req/s trang công khai (phần lớn cache), 50 đơn/s đỉnh, 2.000 kết nối WS đồng thời. p95 API < 300ms |
| Bảo mật | ZAP, Semgrep, CodeQL, gitleaks, Trivy, pentest | Theo [07 §14](./07-bao-mat.md) |
| UAT | Người dùng thật (beta) | Luồng mua/bán, dashboard dễ hiểu không |

**Definition of Done cho mỗi tính năng:** code review bởi 1 người khác, test kèm theo, không giảm coverage module tiền (mục tiêu ≥ 90% cho `wallet`, `orders`, `escrow`, `disputes`), có audit log nếu là hành động nhạy cảm, có rate limit, đã kiểm tra phân quyền, có trạng thái rỗng/lỗi/đang tải trên UI, đã chạy trên staging.

## 4. Chi phí hạ tầng ước tính (giai đoạn đầu)

| Hạng mục | Ước tính / tháng |
|---------|------------------|
| 2 VPS ứng dụng (4 vCPU / 8 GB) | $50 – $100 |
| 1 VPS DB (4 vCPU / 16 GB, NVMe) | $50 – $100 |
| 1 VPS Redis + Meilisearch | $15 – $30 |
| Cloudflare Pro (WAF, Access miễn phí ≤ 50 người dùng Zero Trust) | ~$25 |
| Lưu trữ R2/S3 + backup khác nhà cung cấp | $10 – $30 |
| Email (SES) | $5 – $15 |
| Sentry, Uptime, log | $0 – $50 |
| KMS / Vault | $5 – $20 |
| Phí cổng thanh toán (tuỳ nhà cung cấp, thường theo gói tháng hoặc theo giao dịch) | Theo báo giá |
| **Tổng** | **≈ $160 – $370 / tháng** (khoảng 4 – 10 triệu đồng) |

Chi phí một lần: pentest bên ngoài (thường vài chục đến vài trăm triệu đồng tuỳ phạm vi), tư vấn pháp lý, domain, thiết kế thương hiệu.

> Số liệu chỉ để tham khảo lập ngân sách. Giá thực tế phụ thuộc nhà cung cấp và lưu lượng.

## 5. Rủi ro chính và cách giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|-------|-----|-----------|
| Pháp lý về mô hình ví/giữ tiền và danh mục hàng | Cao | Tư vấn luật sư từ Phase 0, hợp tác tổ chức có giấy phép, danh mục cấm nghiêm |
| Lừa đảo (seller bỏ trốn, người mua khiếu nại gian) | Cao | Escrow, hold theo cấp, KYC, điểm uy tín, chống đa tài khoản |
| Tấn công chiếm tài khoản / rút tiền | Cao | 2FA bắt buộc seller, step-up, khoá rút sau thay đổi bảo mật, rút về ngân hàng trùng tên |
| Lỗi tiền (race condition, sai sổ) | Cao | Sổ cái kép, khoá DB, test concurrency, đối soát hằng ngày, kill-switch |
| DDoS từ đối thủ (thường gặp trong ngành) | Trung bình | Cloudflare, ẩn IP gốc, cache, rate limit, kịch bản "Under Attack" |
| Phụ thuộc 1 cổng thanh toán | Trung bình | Lớp trừu tượng `PaymentProvider`, chuẩn bị nhà cung cấp dự phòng, nạp tay khi sự cố |
| Thiếu seller lúc đầu (cold start) | Trung bình | Mời seller hạt giống, miễn phí 3 tháng đầu, hỗ trợ chuyển kho, chợ yêu cầu kéo nhu cầu trước |
| Phình phạm vi | Trung bình | Bám bảng ưu tiên P1/P2/P3. Mọi yêu cầu mới vào backlog, đánh giá mỗi 2 tuần |
| Phụ thuộc người chủ chốt | Thấp–TB | Tài liệu hoá (bộ này + ADR), review chéo, không ai giữ "chìa khoá" duy nhất |
