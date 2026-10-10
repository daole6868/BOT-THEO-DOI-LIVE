# 10. Pháp lý và vận hành

> ⚠️ Phần này **không phải tư vấn pháp lý**. Nó liệt kê các vấn đề cần làm rõ với luật sư và kế toán thuế **trước khi** ra mắt. Văn bản pháp luật thay đổi thường xuyên, cần kiểm tra bản hiện hành tại thời điểm triển khai.

## 1. Pháp lý cần làm rõ

| Chủ đề | Vấn đề | Việc cần làm |
|-------|--------|-------------|
| **Pháp nhân** | Vận hành sàn có thu phí cần doanh nghiệp có ngành nghề phù hợp | Thành lập công ty, đăng ký ngành nghề TMĐT / dịch vụ CNTT |
| **Sàn giao dịch TMĐT** | Website cho phép bên thứ ba mở gian hàng là "sàn giao dịch TMĐT", phải **đăng ký với Bộ Công Thương** (cổng online.gov.vn) theo Nghị định 52/2013/NĐ-CP, sửa đổi bởi Nghị định 85/2021/NĐ-CP. Theo dõi thêm Luật Thương mại điện tử nếu đã ban hành và có hiệu lực | Chuẩn bị hồ sơ: đề án hoạt động, **Quy chế hoạt động sàn**, điều kiện giao dịch chung. Gắn logo đã đăng ký ở chân trang |
| **Mô hình giữ tiền / ví** | Giữ số dư người dùng và chuyển tiền giữa người dùng có thể bị coi là **dịch vụ trung gian thanh toán** (ví điện tử, thu hộ/chi hộ) cần giấy phép của Ngân hàng Nhà nước (tham khảo Nghị định 52/2024/NĐ-CP về thanh toán không dùng tiền mặt) | Phương án: (a) **hợp tác tổ chức trung gian thanh toán có giấy phép** cung cấp dịch vụ ví/escrow/thu hộ, (b) cấu trúc lại để số dư là khoản trả trước dịch vụ của sàn theo tư vấn luật sư. **Chốt trước khi code module ví** |
| **Thuế** | Quy định mới về quản lý thuế với hoạt động kinh doanh trên nền tảng TMĐT (ví dụ Nghị định 117/2025/NĐ-CP) có thể yêu cầu sàn có chức năng thanh toán **khấu trừ, khai và nộp thuế thay** cho cá nhân/hộ kinh doanh bán trên sàn | Xác nhận với kế toán thuế. Nếu áp dụng thì thiết kế module khấu trừ thuế khi giải ngân, báo cáo định kỳ, chứng từ cho seller |
| **Dữ liệu cá nhân** | Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 01/01/2026) cùng văn bản hướng dẫn: đồng ý, mục đích, đánh giá tác động, thông báo vi phạm, chuyển dữ liệu ra nước ngoài | Chính sách bảo mật, cơ chế đồng ý, hồ sơ đánh giá tác động xử lý dữ liệu, quy trình thông báo sự cố. Cân nhắc máy chủ đặt tại Việt Nam nếu được yêu cầu |
| **An ninh mạng** | Luật An ninh mạng và văn bản hướng dẫn (lưu trữ dữ liệu, phối hợp cơ quan chức năng, gỡ nội dung vi phạm) | Quy trình tiếp nhận yêu cầu từ cơ quan chức năng, lưu log theo thời hạn |
| **Phòng chống rửa tiền** | Có thể phát sinh nghĩa vụ nhận biết khách hàng, báo cáo giao dịch đáng ngờ tuỳ mô hình thanh toán | Làm rõ với luật sư. Thiết kế sẵn KYC seller + cảnh báo giao dịch bất thường (đã có trong [07 §3](./07-bao-mat.md)) |
| **Danh mục hàng hoá** | Một số sản phẩm MMO vi phạm điều khoản của nền tảng gốc (mạng xã hội, game…). Một số vi phạm pháp luật (tài khoản đánh cắp, dữ liệu cá nhân, công cụ tấn công) | Chốt **danh mục cấm** ([01 §4.2](./01-tong-quan.md)) với luật sư. Quy chế ghi rõ trách nhiệm của seller, cơ chế gỡ và khoá |
| **Bảo vệ người tiêu dùng** | Thông tin minh bạch: giá, phí, chính sách hoàn tiền, cơ chế khiếu nại | Trang chính sách rõ ràng, hiển thị phí trước khi mua |

## 2. Văn bản cần có trước khi ra mắt

1. **Quy chế hoạt động sàn**: quyền và nghĩa vụ của sàn, seller, người mua; quy trình giao dịch; escrow; khiếu nại; xử lý vi phạm; danh mục cấm.
2. **Điều khoản sử dụng**.
3. **Chính sách bảo mật và xử lý dữ liệu cá nhân**: nêu rõ việc nhân sự có thể xem chat khi có tranh chấp hoặc báo cáo.
4. **Chính sách khiếu nại, đổi trả và hoàn tiền**.
5. **Chính sách phí** (phí giao dịch theo danh mục, phí rút nếu có).
6. **Thoả thuận người bán**: cam kết nguồn gốc hàng hợp pháp, trách nhiệm bảo hành, chế tài.
7. **Danh mục hàng cấm và hướng dẫn đăng bán**.
8. **Chính sách cấp độ seller** (tiêu chí, quyền lợi, thời gian giữ tiền).
9. `security.txt` + chính sách tiếp nhận báo cáo lỗ hổng.

## 3. Bộ máy vận hành

| Vị trí | Số lượng ban đầu | Nhiệm vụ |
|-------|------------------|---------|
| Trưởng vận hành | 1 | Giám sát SLA, xử lý leo thang cấp 2, báo cáo tuần |
| CSKH / Hỗ trợ | 2–4 (chia ca 7h–24h, trực đêm qua ticket) | Chat hỗ trợ, ticket, khiếu nại cấp 1 |
| Kiểm duyệt viên | 1–2 | Duyệt seller, sản phẩm, bài đăng, báo cáo vi phạm |
| Kế toán | 1 | Đối soát nạp, duyệt rút, báo cáo tài chính, thuế |
| Admin (phân xử) | 1 | Khiếu nại leo thang, quyết định khoá/giữ tiền |

## 4. SLA vận hành (mục tiêu)

| Việc | SLA |
|-----|-----|
| Phản hồi chat hỗ trợ (giờ làm việc) | Lần đầu < 3 phút |
| Ticket ngoài giờ | Trước 9h sáng hôm sau |
| Duyệt hồ sơ seller | < 24 giờ làm việc |
| Duyệt sản phẩm (seller mới) | < 4 giờ làm việc |
| Seller phản hồi khiếu nại | 12 giờ (quá hạn thì tự hoàn tiền) |
| Admin phân xử khiếu nại leo thang | < 24 giờ |
| Duyệt rút tiền | < 4 giờ làm việc (lệnh không bị gắn cờ) |
| Xử lý nạp tiền chưa khớp | < 2 giờ làm việc |
| Xử lý báo cáo lừa đảo / hàng cấm | < 2 giờ (ẩn tạm ngay khi nhận) |

## 5. Quy trình chuẩn (SOP), cần viết chi tiết trước beta

1. **Duyệt seller**: kiểm tra ảnh CCCD (rõ, không chỉnh sửa, khớp selfie), tên ngân hàng trùng tên CCCD, tra trùng CCCD/ngân hàng với tài khoản bị khoá, danh mục đăng ký hợp lệ.
2. **Duyệt sản phẩm**: đúng danh mục, không thuộc danh mục cấm, mô tả không gây hiểu lầm, giá hợp lý, ảnh không vi phạm, không chèn liên hệ ngoài sàn.
3. **Phân xử khiếu nại**: ma trận quyết định theo lý do:

   | Lý do | Bằng chứng người mua | Mặc định |
   |------|---------------------|----------|
   | Không đăng nhập được | Ảnh/video lỗi đăng nhập trong thời gian bảo hành | Đổi item hoặc hoàn tiền item |
   | Sai mô tả | So với bản chụp sản phẩm lúc mua | Hoàn tiền item |
   | Bị thu hồi sau khi giao | Ảnh thông báo khoá | Theo chính sách bảo hành của seller |
   | Dịch vụ không đạt | So với cam kết trong mô tả/báo giá | Hoàn một phần/toàn bộ theo mức độ |
   | Người mua đã đổi mật khẩu/thông tin rồi báo lỗi | — | Thường cho seller (theo chính sách) |

4. **Duyệt rút tiền**: kiểm tra cờ rủi ro, ngân hàng trùng tên, lịch sử giao dịch (có bán thật không), tài khoản mới đổi thông tin bảo mật không. Lệnh vượt ngưỡng thì người thứ 2 chuyển khoản.
5. **Xử lý nạp tiền chưa khớp**: đối chiếu sao kê, biên lai, người dùng. Khớp thủ công 2 bước.
6. **Báo cáo lừa đảo**: ẩn nội dung, đóng băng ví/escrow liên quan, thu thập bằng chứng, quyết định khoá, thông báo người bị hại.
7. **Yêu cầu từ cơ quan chức năng**: tiếp nhận qua kênh chính thức, xác minh văn bản, cung cấp đúng phạm vi, ghi sổ.
8. **Sự cố bảo mật**: theo playbook [07 §13](./07-bao-mat.md).
9. **Offboarding nhân sự**: vô hiệu tài khoản, thu hồi khoá cứng/VPN, xoay bí mật đã từng tiếp cận.

## 6. Kế hoạch thu hút người dùng ban đầu

1. **Seller hạt giống** (trước ra mắt): mời 30–50 seller uy tín từ cộng đồng MMO. Ưu đãi: **miễn phí giao dịch 3 tháng**, cấp "Bạc" ngay (hold ngắn hơn), hỗ trợ chuyển kho hàng.
2. **Người mua**: ưu đãi nạp lần đầu (ví dụ tặng % dưới dạng mã giảm giá, không phải tiền rút được), chương trình giới thiệu.
3. **Nội dung**: blog hướng dẫn MMO, SEO danh mục, nhóm cộng đồng Telegram/Facebook, livestream giới thiệu cơ chế escrow.
4. **Chợ yêu cầu** là công cụ kéo nhu cầu: người mua đăng nhu cầu thì seller tìm đến sàn để báo giá.
5. Điểm khác biệt khi truyền thông: **"Tiền được sàn giữ – hàng lỗi được hoàn tự động – rút tiền nhanh – bảo mật 2 lớp"**.

## 7. Họp và chỉ số theo dõi định kỳ

| Chu kỳ | Nội dung |
|--------|---------|
| Hằng ngày | Đối soát tiền, hàng chờ quá SLA, cảnh báo bảo mật/gian lận, sự cố |
| Hằng tuần | KPI ([01 §6](./01-tong-quan.md)), top khiếu nại theo danh mục/seller, CSAT, sprint review |
| Hằng tháng | Báo cáo tài chính, rà soát quyền nhân sự, rà soát danh mục cấm, kiểm tra khôi phục backup, cập nhật phụ thuộc |
| Hằng quý | Pentest lại (phạm vi thay đổi), rà soát pháp lý, xoay khoá theo lịch |
