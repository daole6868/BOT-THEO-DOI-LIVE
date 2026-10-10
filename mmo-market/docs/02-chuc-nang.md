# 02. Danh sách chức năng theo module

Ký hiệu độ ưu tiên: **P1** = MVP lõi (Phase 1), **P2** = trước khi ra mắt (Phase 2), **P3** = sau ra mắt hoặc khi còn thời gian.

---

## A. Tài khoản và xác thực

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Đăng ký | Email + mật khẩu + tên hiển thị + CAPTCHA (Cloudflare Turnstile). Đồng ý điều khoản | P1 |
| Xác minh email | Gửi link một lần, hết hạn sau 30 phút. Chưa xác minh thì chỉ được xem | P1 |
| Đăng nhập | Email/tên đăng nhập + mật khẩu. Có 2FA thì nhập thêm mã TOTP | P1 |
| 2FA (TOTP) | Google Authenticator/Authy. Mã khôi phục 10 mã dùng 1 lần. **Bắt buộc** với seller và nhân sự sàn | P1 |
| Quên mật khẩu | Link đặt lại 1 lần, 15 phút. Đổi xong thì đăng xuất mọi phiên | P1 |
| Quản lý phiên | Danh sách thiết bị/IP/thời gian, đăng xuất từng phiên hoặc tất cả | P1 |
| Lịch sử đăng nhập | 30 ngày gần nhất. Cảnh báo email khi đăng nhập từ thiết bị/quốc gia mới | P1 |
| Mã PIN giao dịch | PIN 6 số riêng cho rút tiền, đổi tài khoản ngân hàng (ngoài 2FA) | P2 |
| Hồ sơ | Avatar, tên hiển thị, giới thiệu, liên kết Telegram nhận thông báo | P1 |
| Đăng nhập Google | OAuth, vẫn yêu cầu 2FA nếu đã bật | P3 |
| Passkey (WebAuthn) | Đăng nhập không mật khẩu, khuyến nghị cho admin | P3 |
| Xoá tài khoản | Theo quy định bảo vệ dữ liệu cá nhân. Giữ dữ liệu giao dịch theo luật | P2 |

## B. Gian hàng (Store)

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Đăng ký bán hàng | Form: tên gian hàng, slug, danh mục chính, mô tả, liên hệ. Kèm KYC: CCCD 2 mặt + ảnh selfie cầm CCCD, tài khoản ngân hàng **trùng tên** | P1 |
| Duyệt seller | Admin duyệt/từ chối kèm lý do. Seller nhận thông báo | P1 |
| Trang gian hàng | Banner, avatar, mô tả, huy hiệu cấp độ, điểm đánh giá, số đơn đã bán, tỷ lệ khiếu nại, thời gian phản hồi chat, ngày tham gia, trạng thái online | P1 |
| Chính sách gian hàng | Thời gian bảo hành mặc định, chính sách đổi/hoàn, ghi chú cho người mua | P1 |
| Theo dõi gian hàng | Người mua bấm theo dõi, nhận thông báo khi có sản phẩm mới hoặc giảm giá | P2 |
| Chế độ nghỉ | Seller bật "tạm nghỉ": ẩn nút mua, hiển thị ngày quay lại | P2 |
| Cấp độ seller | Mới → Đồng → Bạc → Vàng → Kim cương, theo số đơn, GMV, tỷ lệ khiếu nại, thâm niên. Cấp ảnh hưởng thời gian giữ tiền, hạn mức rút, phí | P2 |
| Nhân viên gian hàng | Mời thành viên với quyền con | P3 |
| Gói gian hàng | Gói trả phí: giảm phí giao dịch, thêm slot, huy hiệu | P3 |

## C. Sản phẩm và kho hàng

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Tạo sản phẩm | Tên, danh mục, ảnh (tối đa 8), mô tả (Markdown giới hạn), thuộc tính theo danh mục, kiểu giao (tự động/thủ công), thời gian bảo hành, tags | P1 |
| Biến thể (gói) | Một sản phẩm nhiều gói: "1 tài khoản", "Lô 10", "Lô 100", mỗi gói giá và kho riêng | P1 |
| Giá theo số lượng | Mua ≥ 10 giảm X%, ≥ 100 giảm Y% | P2 |
| Kho hàng số | Nhập theo dòng (dán text hoặc tải file .txt/.csv), mỗi dòng là 1 stock item. Định dạng mẫu do seller khai báo, ví dụ `email|password|recovery` | P1 |
| Kiểm tra trùng | Phát hiện dòng trùng trong lô, trùng với kho hiện có, trùng với hàng **đã bán** (dùng hash). Cảnh báo seller, chặn nếu trùng hàng đã bán | P1 |
| Trạng thái kho | Còn hàng / Đã giữ chỗ / Đã bán / Đã thu hồi. Hiển thị số tồn realtime | P1 |
| Cảnh báo sắp hết | Ngưỡng do seller đặt, gửi thông báo | P2 |
| Sản phẩm dịch vụ | Không có kho. Có "thời gian hoàn thành cam kết", trường người mua phải điền khi đặt (link, yêu cầu…) | P1 |
| Trạng thái sản phẩm | Nháp → Chờ duyệt → Đang bán → Tạm ẩn → Bị khoá (vi phạm) | P1 |
| Duyệt sản phẩm | Seller cấp "Mới" bị duyệt thủ công. Seller uy tín được tự duyệt, có kiểm tra hậu kỳ ngẫu nhiên | P1 |
| Nhân bản sản phẩm | Copy nhanh để tạo sản phẩm tương tự | P2 |
| Nhập kho qua API | API key cho seller tự động nạp kho | P3 |

## D. Danh mục, tìm kiếm và bộ lọc

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Cây danh mục | 2–3 cấp, có icon, ảnh, mô tả SEO. Admin kéo thả để sắp xếp | P1 |
| Thuộc tính theo danh mục | Admin định nghĩa: kiểu (chọn 1, chọn nhiều, số, khoảng, có/không), bắt buộc hay không, có dùng làm bộ lọc không | P1 |
| Tìm kiếm | Gõ có dấu hoặc không dấu, chịu lỗi chính tả, gợi ý khi gõ (sản phẩm, gian hàng, danh mục) | P1 |
| Bộ lọc chung | Danh mục, khoảng giá (thanh trượt + ô nhập), kiểu giao (tự động/thủ công), còn hàng, số sao tối thiểu, cấp seller, thời gian bảo hành, có giảm giá | P1 |
| Bộ lọc theo danh mục | Sinh tự động từ thuộc tính. Ví dụ: Quốc gia, Năm tạo, Có 2FA | P1 |
| Đếm kết quả | Mỗi lựa chọn lọc hiển thị số kết quả, ví dụ "Có 2FA (1.204)" | P1 |
| Chip lọc đang áp dụng | Thanh chip phía trên kết quả, bấm × để bỏ từng bộ lọc, nút "Xoá tất cả" | P1 |
| Sắp xếp | Phù hợp nhất, Bán chạy, Mới nhất, Giá tăng/giảm, Đánh giá cao | P1 |
| Lọc lưu trên URL | Mọi bộ lọc nằm trên query string, chia sẻ link được, back/forward không mất trạng thái | P1 |
| Chế độ xem | Lưới / Danh sách (danh sách hợp với hàng tài khoản, nhiều thông số) | P2 |
| Bộ lọc mobile | Bottom sheet toàn màn hình, nút "Xem N kết quả" | P1 |
| Lưu tìm kiếm | Lưu bộ lọc, nhận thông báo khi có sản phẩm mới khớp | P3 |

## E. Giỏ hàng, đặt hàng và thanh toán

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Mua ngay | Chọn gói + số lượng, thanh toán bằng số dư ví. Nhập mã PIN/2FA nếu đơn lớn hơn ngưỡng | P1 |
| Giỏ hàng | Nhiều sản phẩm từ nhiều gian hàng. Tách thành nhiều đơn theo gian hàng | P2 |
| Nạp thiếu tiền | Thiếu số dư thì hiển thị mã QR nạp đúng số tiền thiếu, nạp xong tự động tiếp tục đơn | P2 |
| Nhận hàng tự động | Đơn tự động giao ngay: hiển thị dữ liệu trong trang đơn, nút copy, tải .txt | P1 |
| Đơn dịch vụ | Người mua điền thông tin yêu cầu. Seller nhận, thực hiện, bấm "Đã giao" kèm bằng chứng | P1 |
| Xác nhận hoàn tất | Người mua bấm "Đã nhận, hài lòng" để giải ngân sớm, hoặc hệ thống tự hoàn tất khi hết thời gian bảo hành | P1 |
| Lịch sử đơn | Lọc theo trạng thái, thời gian, gian hàng. Tìm theo mã đơn | P1 |
| Mã giảm giá | Mã của sàn hoặc của gian hàng: % / số tiền cố định, giới hạn lượt, hạn dùng, đơn tối thiểu | P3 |

## F. Ví, nạp tiền và rút tiền

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Số dư | Hiển thị: **Khả dụng**, **Đang giữ** (escrow của seller), **Đang chờ rút** | P1 |
| Nạp tiền VietQR | Sinh QR với nội dung chuyển khoản duy nhất (ví dụ `MMO8X2K9QZ`). Webhook từ cổng thanh toán xác nhận, cộng tiền trong vài giây | P1 |
| Nạp tay | Nạp sai nội dung: người dùng gửi yêu cầu kèm ảnh biên lai, kế toán đối soát rồi cộng | P1 |
| Lịch sử giao dịch ví | Mọi biến động có mã tham chiếu, số dư trước/sau | P1 |
| Liên kết ngân hàng | Tối đa 3 tài khoản, **trùng tên KYC**. Đổi tài khoản thì khoá rút 24–72 giờ | P2 |
| Rút tiền | Số tiền tối thiểu, hạn mức ngày theo cấp seller, yêu cầu 2FA + PIN, kế toán duyệt rồi chuyển khoản, đánh dấu đã chuyển kèm mã giao dịch ngân hàng | P2 |
| Rút tự động | Seller uy tín, số tiền dưới ngưỡng: chi qua API ngân hàng/cổng chi hộ | P3 |

## G. Ký quỹ (escrow), bảo hành và khiếu nại

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Giữ tiền | Mỗi đơn tạo 1 khoản escrow. Thời gian giữ = max(bảo hành sản phẩm, thời gian tối thiểu theo cấp seller) | P1 |
| Giải ngân tự động | Job chạy mỗi phút: escrow hết hạn và không có khiếu nại mở thì chuyển tiền sau phí cho seller | P1 |
| Mở khiếu nại | Trong thời gian bảo hành. Người mua chọn lý do (sai mô tả, không đăng nhập được, thiếu hàng…), chọn item lỗi, đính kèm bằng chứng | P1 |
| Xử lý khiếu nại | Seller có X giờ để phản hồi: **đổi item** (lấy item mới từ kho), **hoàn tiền một phần/toàn bộ**, hoặc **từ chối kèm bằng chứng**. Không phản hồi đúng hạn thì tự động hoàn tiền | P1 |
| Leo thang | Một bên không đồng ý thì chuyển admin phân xử, có kênh chat 3 bên | P2 |
| Kết quả | Hoàn tiền toàn phần/một phần cho người mua, phần còn lại giải ngân cho seller. Ghi sổ cái đầy đủ | P1 |
| Chống lạm dụng | Người mua khiếu nại nhiều bất thường thì gắn cờ. Seller tỷ lệ khiếu nại cao thì tăng thời gian giữ tiền, giảm cấp | P2 |

## H. Đánh giá và uy tín

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Đánh giá đơn | 1–5 sao + nhận xét + ảnh, chỉ khi đơn đã hoàn tất. Mỗi đơn 1 đánh giá, sửa trong 7 ngày | P1 |
| Seller phản hồi | Seller trả lời 1 lần dưới đánh giá | P1 |
| Điểm uy tín | Tổng hợp: điểm sao trung bình (có trọng số thời gian), tỷ lệ khiếu nại, tỷ lệ phản hồi chat, đơn hoàn tất | P2 |
| Báo cáo đánh giá | Báo cáo đánh giá spam hoặc tống tiền, mod xem xét | P2 |

## I. Chợ yêu cầu (bài đăng tìm hàng, bình luận, báo giá)

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Đăng bài yêu cầu | Tiêu đề, danh mục, mô tả (Markdown giới hạn, có ảnh), ngân sách (khoảng), số lượng, hạn chót, hình thức (công khai giá / ẩn giá) | P1 |
| Danh sách bài | Bộ lọc: danh mục, ngân sách, trạng thái (đang mở / đã chốt / hết hạn), mới nhất, nhiều báo giá nhất. Thẻ bài hiện ngân sách, số bình luận, số báo giá, thời gian còn lại | P1 |
| Bình luận | Mọi người dùng đã xác minh được bình luận. Hỗ trợ **trả lời bình luận** (2 cấp hiển thị: bình luận gốc → trả lời; trả lời sâu hơn thì gắn @tên vào cấp 2) | P1 |
| Tương tác bình luận | Thích, @nhắc tên (gửi thông báo), sửa (có nhãn "đã sửa"), xoá mềm, báo cáo | P1 |
| Báo giá (Offer) | Chỉ seller: giá, thời gian giao, mô tả, liên kết sản phẩm có sẵn. Hiển thị riêng tab "Báo giá" (chỉ chủ bài xem chi tiết giá nếu bài chọn "ẩn giá") | P2 |
| Chốt báo giá | Chủ bài chọn 1 báo giá thì hệ thống tạo đơn (escrow) theo giá đó, bài chuyển trạng thái "Đã chốt" | P2 |
| Nhắn tin từ bài | Nút "Nhắn tin" mở chat với người đăng/người báo giá, chat gắn ngữ cảnh bài | P2 |
| Đóng/gia hạn bài | Chủ bài đóng sớm hoặc gia hạn. Bài hết hạn thì tự đóng | P1 |
| Ghim / đẩy bài | Admin ghim bài thông báo. Người dùng trả phí để đẩy bài | P3 |
| Kiểm duyệt | Lọc từ khoá cấm, giới hạn tần suất, tài khoản mới phải qua duyệt bài đầu tiên | P1 |

## J. Nhắn tin (chat)

| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Chat 1-1 | Người mua với người bán. Mở từ trang sản phẩm, gian hàng, đơn hàng, bài yêu cầu (gắn thẻ ngữ cảnh ở đầu hội thoại) | P2 |
| Chat hỗ trợ | Nút "Hỗ trợ" nổi góc màn hình. Chọn chủ đề (Nạp tiền, Đơn hàng, Tài khoản, Khác) rồi vào hàng chờ, hỗ trợ viên rảnh nhận. Ngoài giờ thì tạo ticket | P2 |
| Realtime | Tin nhắn tức thì, trạng thái đã gửi/đã xem, đang gõ…, online/offline | P2 |
| Đính kèm | Ảnh (tự nén), file nhỏ ≤ 10MB (quét virus), **thẻ đơn hàng / thẻ sản phẩm** | P2 |
| Cảnh báo an toàn | Phát hiện SĐT/Zalo/Telegram/link ngoài/"chuyển khoản trực tiếp" thì hiện cảnh báo "Giao dịch ngoài sàn không được bảo vệ" | P2 |
| Chặn & báo cáo | Chặn người dùng, báo cáo hội thoại (gửi kèm tin nhắn cho mod) | P2 |
| Tìm trong chat | Tìm theo người, theo nội dung | P3 |
| Tin nhắn mẫu | Seller lưu câu trả lời nhanh | P3 |
| Chat 3 bên | Admin tham gia hội thoại khi khiếu nại leo thang | P2 |

## K. Thông báo

| Kênh | Sự kiện ví dụ | Ưu tiên |
|------|---------------|---------|
| Trong web (chuông) | Đơn mới, đơn đã giao, khiếu nại, bình luận/trả lời, @nhắc, báo giá mới, tin nhắn, rút tiền đã duyệt | P1 |
| Email | Xác minh, đặt lại mật khẩu, đăng nhập lạ, nạp/rút, khiếu nại | P1 |
| Telegram bot | Seller nhận đơn mới, sắp hết kho. Người dùng nhận nạp/rút | P3 |
| Web push | Tin nhắn mới khi không mở tab | P3 |
| Cài đặt | Người dùng bật/tắt từng loại theo kênh | P2 |

## L. Seller Center

> Chi tiết giao diện tại [08 – §5](./08-giao-dien-va-dashboard.md).

- **Tổng quan**: thẻ KPI, biểu đồ doanh thu, đơn theo trạng thái, việc cần làm (P1 cơ bản, P2 đầy đủ).
- **Sản phẩm**: danh sách, tạo/sửa, nhân bản, bật/tắt hàng loạt (P1).
- **Kho hàng**: nhập kho, lịch sử nhập, tồn theo gói, cảnh báo trùng/hết (P1).
- **Đơn hàng**: danh sách có bộ lọc, chi tiết, giao đơn dịch vụ, xuất CSV (P1).
- **Khiếu nại**: hàng chờ có đếm ngược hạn phản hồi (P1).
- **Tài chính**: số dư, escrow sắp giải ngân, lịch sử, rút tiền (P1/P2).
- **Đánh giá**: danh sách, phản hồi (P1).
- **Báo giá**: các báo giá đã gửi, tỷ lệ được chốt (P2).
- **Marketing**: mã giảm giá, đẩy tin (P3).
- **Cài đặt gian hàng**: thông tin, chính sách, chế độ nghỉ, API key (P1/P3).

## M. Admin Panel

> Chi tiết giao diện tại [08 – §6](./08-giao-dien-va-dashboard.md).

| Khu vực | Chức năng | Ưu tiên |
|---------|-----------|---------|
| Dashboard | KPI realtime, biểu đồ, hàng chờ việc, cảnh báo | P1 |
| Người dùng | Tìm/lọc, xem hồ sơ 360° (đơn, ví, đăng nhập, báo cáo), khoá/mở, reset 2FA (có quy trình), gắn cờ | P1 |
| Seller | Hàng chờ KYC, duyệt/từ chối, điều chỉnh cấp, phí riêng, khoá gian hàng | P1 |
| Danh mục & thuộc tính | CRUD, kéo thả, cấu hình phí % theo danh mục, thuộc tính lọc | P1 |
| Sản phẩm | Hàng chờ duyệt, tìm kiếm, khoá/mở, xem lịch sử thay đổi | P1 |
| Đơn hàng | Tìm theo mã/người/gian hàng, xem dòng thời gian của đơn | P1 |
| Khiếu nại | Hàng chờ theo SLA, phân xử, xem bằng chứng, xem nội dung item (ghi log + lý do) | P1 |
| Tài chính | Nạp tiền (đối soát, nạp tay), rút tiền (duyệt 2 bước), sổ cái, điều chỉnh số dư (cần 2 người duyệt), báo cáo doanh thu phí | P1 |
| Chợ yêu cầu & bình luận | Xem/ẩn/xoá bài, bình luận bị báo cáo, từ khoá cấm | P1 |
| Hỗ trợ | Hộp thư chat hỗ trợ, ticket, phân công, mẫu trả lời, đánh giá CSAT | P2 |
| Báo cáo vi phạm | Hàng chờ báo cáo (sản phẩm, bài, bình luận, chat, người dùng) | P1 |
| Nội dung | Banner, trang tĩnh (điều khoản, FAQ), blog/tin tức, thông báo hệ thống | P2 |
| Nhân sự & phân quyền | Tài khoản nhân viên, vai trò, permission | P1 |
| Nhật ký (audit log) | Mọi thao tác admin: ai, lúc nào, IP, trước/sau | P1 |
| Cấu hình | Phí, thời gian giữ tiền theo cấp, hạn mức, ngưỡng cảnh báo, **công tắc khẩn cấp** (tạm dừng rút, tạm dừng đăng ký, bảo trì) | P1 |
| Chống gian lận | Danh sách cảnh báo: đa tài khoản, nạp-rút nhanh, khiếu nại bất thường | P2 |

## N. Hỗ trợ và ticket

- Trung tâm trợ giúp (FAQ có tìm kiếm), P2.
- Ticket: chủ đề, mức ưu tiên, trạng thái (Mới → Đang xử lý → Chờ khách → Đã giải quyết → Đóng), SLA, P2.
- Chat hỗ trợ ngoài giờ tự chuyển thành ticket, P2.
- Đánh giá mức hài lòng (CSAT) sau khi đóng, P3.

## O. Marketing và tăng trưởng (P3)

- Mã giảm giá sàn/gian hàng.
- Chương trình giới thiệu (affiliate): người giới thiệu nhận % phí sàn của người được giới thiệu trong N tháng. Chống tự giới thiệu (cùng IP/thiết bị/ngân hàng).
- Đẩy tin, banner trả phí, flash sale theo khung giờ.
- SEO: trang danh mục/sản phẩm render phía server, sitemap, schema.org Product/Offer/Review, URL thân thiện.

## P. Trang nội dung

- Trang chủ, Giới thiệu, Quy chế hoạt động sàn, Điều khoản sử dụng, Chính sách bảo mật, Chính sách khiếu nại & hoàn tiền, Danh mục hàng cấm, Hướng dẫn mua/bán, Liên hệ (P1, bắt buộc trước khi ra mắt).
- Blog/Tin tức MMO, hướng dẫn (P3, phục vụ SEO).
