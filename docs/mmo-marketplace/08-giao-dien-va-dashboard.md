# 08. Giao diện, bộ lọc, dashboard Seller và Admin

## 1. Nguyên tắc thiết kế

1. **Rõ ràng trước, đẹp sau**: mỗi màn hình có 1 việc chính, nút chính nổi bật nhất.
2. **Quy tắc 5 giây cho dashboard**: mở ra trong 5 giây phải biết *"hôm nay thế nào"* và *"có việc gì cần làm ngay"*.
3. **Tin cậy**: luôn hiển thị huy hiệu escrow, bảo hành, cấp seller, đánh giá ở nơi ra quyết định mua.
4. **Nhất quán**: cùng một trạng thái thì luôn cùng màu, cùng icon, cùng tên ở mọi nơi.
5. **Mobile-first** cho phía người mua (đa số truy cập từ điện thoại). **Desktop-first** cho Seller Center và Admin (nhiều bảng dữ liệu), nhưng vẫn dùng được trên mobile.
6. **Dark mode** đầy đủ (người dùng MMO thường làm việc ban đêm), chuyển theo hệ thống hoặc chọn tay.

## 2. Hệ thống thiết kế (Design System)

| Thành phần | Quy định |
|-----------|---------|
| Font | **Be Vietnam Pro** (hiển thị dấu tiếng Việt chuẩn). Số dùng `font-variant-numeric: tabular-nums` để các cột số thẳng hàng |
| Cỡ chữ | 12 / 14 (mặc định) / 16 / 20 / 24 / 30 / 36 |
| Khoảng cách | Lưới 4px: 4, 8, 12, 16, 24, 32, 48 |
| Bo góc | 8px (input, nút), 12px (card), 16px (modal) |
| Màu chính | Primary: Indigo `#4F46E5` (dark: `#818CF8`) · Nền: `#F8FAFC` / dark `#0B1120` · Card: `#FFFFFF` / dark `#111827` |
| Màu ngữ nghĩa | Thành công `#16A34A` · Cảnh báo `#D97706` · Lỗi `#DC2626` · Thông tin `#0284C7` · Trung tính `#64748B` |
| Định dạng tiền | `1.234.567 ₫` (đầy đủ). Trên biểu đồ/thẻ nhỏ rút gọn `1,2 tr`, `350 N`, `1,5 tỷ` |
| Định dạng thời gian | Tương đối dưới 24h ("5 phút trước"), sau đó `10/10/2026 14:30` |
| Component | shadcn/ui: Button, Input, Select, Combobox, Slider, Checkbox, Switch, Tabs, Dialog, Sheet (bottom sheet mobile), Toast, Tooltip, Badge, Avatar, Skeleton, DataTable, DateRangePicker, Command palette (Ctrl+K) |
| Icon | Lucide, nét 1.5px, cỡ 16/20/24 |
| Trạng thái rỗng | Minh hoạ nhỏ + 1 câu giải thích + 1 nút hành động ("Chưa có sản phẩm → Tạo sản phẩm đầu tiên") |
| Đang tải | Skeleton đúng hình dạng nội dung, không dùng spinner toàn trang |

**Màu trạng thái đơn hàng (dùng thống nhất toàn hệ thống)**

| Trạng thái | Nhãn | Màu badge |
|-----------|------|-----------|
| `paid` | Đã thanh toán | Xanh dương |
| `in_progress` | Đang thực hiện | Vàng cam |
| `delivered` | Đã giao · Đang bảo hành | Tím (indigo) |
| `disputed` | Khiếu nại | Đỏ |
| `completed` | Hoàn tất | Xanh lá |
| `refunded` / `partially_refunded` | Đã hoàn tiền | Xám |
| `cancelled` | Đã huỷ | Xám nhạt, gạch ngang |

**Bảng màu biểu đồ**: tối đa 6 màu phân loại, cố định ý nghĩa: doanh thu = primary, đơn hàng = xanh ngọc, hoàn tiền/khiếu nại = đỏ, phí sàn = tím, nạp = xanh lá, rút = cam. Đạt tương phản WCAG AA ở cả 2 theme.

## 3. Sơ đồ trang (Sitemap)

```
Công khai
├── /                              Trang chủ
├── /danh-muc/:slug                Danh mục (+ bộ lọc)
├── /tim-kiem?q=                   Kết quả tìm kiếm
├── /:storeSlug/:productSlug       Chi tiết sản phẩm
├── /shop/:storeSlug               Gian hàng
├── /yeu-cau                       Chợ yêu cầu (danh sách)
├── /yeu-cau/:id                   Chi tiết bài + bình luận + báo giá
├── /tro-giup, /quy-che, /dieu-khoan, /bao-mat, /hang-cam, /lien-he
└── /dang-nhap, /dang-ky, /quen-mat-khau

Tài khoản người mua (/tai-khoan)
├── /don-hang, /don-hang/:code     Đơn hàng, nhận hàng, khiếu nại, đánh giá
├── /vi                            Số dư, nạp, lịch sử, ngân hàng, rút
├── /tin-nhan                      Chat (cũng mở dạng popup)
├── /bai-dang                      Bài yêu cầu của tôi
├── /theo-doi                      Gian hàng theo dõi, tìm kiếm đã lưu
├── /thong-bao
├── /bao-mat                       Mật khẩu, 2FA, PIN, phiên đăng nhập, lịch sử
└── /dang-ky-ban-hang              Form KYC

Seller Center (/seller)
├── /                              Tổng quan (dashboard)
├── /san-pham, /san-pham/moi, /san-pham/:id
├── /kho                           Nhập kho, lịch sử lô, tồn theo gói
├── /don-hang, /don-hang/:code
├── /khieu-nai
├── /tai-chinh                     Số dư, escrow, rút tiền, sao kê
├── /danh-gia
├── /bao-gia                       Báo giá đã gửi, bài yêu cầu phù hợp
├── /tin-nhan
├── /marketing                     Mã giảm giá, đẩy tin (P3)
└── /cai-dat                       Thông tin gian hàng, chính sách, nghỉ, API key

Admin (admin.mmomarket.vn)
├── /                              Dashboard
├── /nguoi-dung, /nguoi-dung/:id   Hồ sơ 360°
├── /seller/duyet, /gian-hang
├── /danh-muc                      Cây danh mục + thuộc tính lọc
├── /san-pham/duyet, /san-pham
├── /don-hang, /khieu-nai
├── /tai-chinh/nap, /tai-chinh/rut, /tai-chinh/so-cai, /tai-chinh/doi-soat, /tai-chinh/dieu-chinh
├── /cong-dong/bai-dang, /cong-dong/binh-luan, /bao-cao-vi-pham, /tu-khoa-cam
├── /ho-tro                        Hộp thư chat hỗ trợ + ticket
├── /noi-dung                      Banner, trang tĩnh, blog
├── /gian-lan                      Cảnh báo rủi ro
├── /nhan-su, /phan-quyen
├── /nhat-ky                       Audit log
└── /cau-hinh                      Phí, hold, hạn mức, kill-switch
```

## 4. Các trang phía người mua

### 4.1 Trang chủ

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] MMO Market   [🔍 Tìm tài khoản, tool, proxy, dịch vụ...        ]  💬 🔔 [💰 1,2tr]│
│ Danh mục ▾  Chợ yêu cầu   Gian hàng uy tín   Hướng dẫn               [Avatar ▾]      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────── Banner / khuyến mãi (carousel) ───────────────┐ ┌─ Bảo vệ người mua ─┐ │
│ │                                                               │ │ ✓ Giữ tiền escrow │ │
│ │                                                               │ │ ✓ Bảo hành tự động│ │
│ └───────────────────────────────────────────────────────────────┘ │ ✓ Hỗ trợ 24/7     │ │
│                                                                   └───────────────────┘ │
│ Danh mục nổi bật                                                                        │
│ [📧 Email] [👥 MXH] [🎮 Game] [🛠 Tool] [🔑 Key] [🌐 Proxy/VPS] [🎨 Dịch vụ] [📚 Khoá học] │
│                                                                                         │
│ 🔥 Bán chạy hôm nay                                                     Xem tất cả →   │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                                  │
│ │ ảnh    │ │        │ │        │ │        │ │        │  Thẻ sản phẩm:                   │
│ │ Tên SP │ │        │ │        │ │        │ │        │  tên, giá từ, ⭐4.8 (532),        │
│ │ 15.000₫│ │        │ │        │ │        │ │        │  Đã bán 10k, ⚡Tự động, Còn 1.204 │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  huy hiệu cấp seller              │
│                                                                                         │
│ 📝 Yêu cầu mới nhất từ người mua                                        Xem chợ →       │
│  • Cần 200 tài khoản X, ngân sách 2–3tr · 5 báo giá · còn 2 ngày                        │
│  • Cần người setup tool Y ... · 2 báo giá · còn 6 giờ                                  │
│                                                                                         │
│ 🏆 Gian hàng uy tín     [avatar] Shop A ⭐4.9 · 💎 Kim cương · 50k đơn  ...             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Trang danh mục với bộ lọc (desktop)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Trang chủ › Tài khoản › Email                                                           │
│ Tài khoản Email  ·  3.482 sản phẩm                                                      │
├────────────────────────┬────────────────────────────────────────────────────────────────┤
│ BỘ LỌC        Xoá hết  │ Đang lọc: [Quốc gia: VN ×] [Có 2FA ×] [Giá 10k–50k ×] Xoá tất cả│
│                        │                                                                │
│ ▾ Danh mục con         │ 1.204 kết quả     Sắp xếp: [Bán chạy ▾]     [▦ Lưới] [☰ Danh sách]│
│   ○ Gmail      (2.100) │ ┌──────────────────────────────────────────────────────────────┐ │
│   ○ Outlook      (840) │ │ [ảnh] Gmail cổ 2015 – đã XM SĐT        ⚡Tự động  🛡 BH 72h   │ │
│   ○ Yahoo        (310) │ │       Shop ABC 🥇Vàng ⭐4.8 (532) · Đã bán 10.4k · Còn 1.204   │ │
│                        │ │       VN · 2015 · 2FA ✓                      từ 15.000₫ [Mua]│ │
│ ▾ Khoảng giá           │ ├──────────────────────────────────────────────────────────────┤ │
│   ●────────●───────    │ │ [ảnh] ...                                                    │ │
│   [10.000] – [50.000]  │ ├──────────────────────────────────────────────────────────────┤ │
│   ▁▂▅█▇▅▃▂▁ (phân bố)  │ │ [ảnh] ...                                                    │ │
│                        │ └──────────────────────────────────────────────────────────────┘ │
│ ▾ Kiểu giao hàng       │                                                                │
│   ☑ ⚡ Tự động (1.150) │                    [ Xem thêm 20 sản phẩm ]                     │
│   ☐ 👤 Thủ công   (54) │                                                                │
│                        │                                                                │
│ ▾ Quốc gia             │                                                                │
│   ☑ Việt Nam    (620)  │                                                                │
│   ☐ Mỹ          (410)  │                                                                │
│   ☐ Khác        (174)  │                                                                │
│   + Xem thêm           │                                                                │
│ ▾ Năm tạo  [2010]–[2024]│                                                               │
│ ▾ Bảo mật              │                                                                │
│   [●] Có 2FA           │                                                                │
│   [ ] Đã xác minh SĐT  │                                                                │
│ ▾ Đánh giá             │                                                                │
│   ○ ⭐⭐⭐⭐⭐ trở lên    │                                                                │
│   ● ⭐⭐⭐⭐ trở lên      │                                                                │
│ ▾ Cấp gian hàng        │                                                                │
│   [Mới][Đồng][Bạc][Vàng][KC]                                                            │
│ ▾ Bảo hành ≥ [24h ▾]   │                                                                │
│ ☑ Chỉ hiện còn hàng    │                                                                │
└────────────────────────┴────────────────────────────────────────────────────────────────┘
```

**Quy tắc UX bộ lọc (trực quan, dễ dùng):**
- **Số đếm cạnh mỗi lựa chọn** (facet count). Lựa chọn cho 0 kết quả thì làm mờ nhưng không ẩn, để người dùng hiểu.
- **Áp dụng ngay** trên desktop (debounce 300ms, không cần nút "Áp dụng"). URL cập nhật `?country=VN&has_2fa=1&price=10000-50000`.
- **Thanh chip** phía trên kết quả: thấy ngay mình đang lọc gì, bỏ từng cái 1 chạm.
- **Thanh trượt giá có biểu đồ phân bố** (histogram nhỏ) để biết khoảng giá nào nhiều hàng.
- Nhóm lọc dài: hiện 5 mục + "Xem thêm", có ô tìm trong nhóm nếu > 10 mục.
- Bộ lọc **thay đổi theo danh mục** (sinh từ `category_attributes`). Bộ lọc chung luôn ở cuối.
- Giữ vị trí cuộn và trạng thái lọc khi bấm "Quay lại" từ trang chi tiết.
- Chế độ **Danh sách** cho hàng tài khoản: 1 dòng nhiều thông số, so sánh nhanh. Chế độ **Lưới** cho khoá học, dịch vụ có ảnh.

**Bộ lọc trên mobile:**

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ ← Email          🔍  💬       │        │ Bộ lọc                  ✕    │
│ [⚙ Lọc (3)] [Bán chạy ▾]     │  ───▶  │ ─────────────────────────────│
│ [VN ×][2FA ×][10k–50k ×]      │  chạm  │ Danh mục con          Gmail ›│
│ ┌──────────────────────────┐ │        │ Khoảng giá       10k – 50k › │
│ │[ảnh] Gmail cổ 2015       │ │        │ Kiểu giao            Tự động ›│
│ │ 15.000₫ ⭐4.8 ⚡ Còn 1.204│ │        │ Quốc gia           Việt Nam › │
│ └──────────────────────────┘ │        │ Có 2FA                 [●]   │
│ ┌──────────────────────────┐ │        │ Đánh giá            4⭐ trở lên│
│ │ ...                      │ │        │ ...                          │
│                              │        │ ─────────────────────────────│
│                              │        │ [Xoá hết]  [ Xem 1.204 kết quả ]│
└──────────────────────────────┘        └──────────────────────────────┘
```

### 4.3 Chi tiết sản phẩm

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────┐  Gmail cổ 2015 – đã xác minh SĐT                                 │
│ │                     │  ⭐ 4.8 (532 đánh giá) · Đã bán 10.432 · ⚡ Giao tự động          │
│ │      ảnh lớn        │  ───────────────────────────────────────────────                 │
│ │                     │  Chọn gói:  (● 1 tài khoản 15.000₫) (○ Lô 10 140.000₫) (○ Lô 100)│
│ └─────────────────────┘  Số lượng:  [ - ]  3  [ + ]     Còn 1.204                        │
│ [▫][▫][▫][▫]              Mua ≥ 10: giảm 7% · Mua ≥ 100: giảm 15%                         │
│                          Tổng: 45.000₫                                                   │
│                          [      MUA NGAY      ]  [ 💬 Nhắn người bán ]  [♡]              │
│                          ┌────────────────────────────────────────────────────┐          │
│                          │ 🛡 Tiền được sàn giữ 72h · Lỗi được đổi/hoàn tự động │          │
│                          └────────────────────────────────────────────────────┘          │
│                          ┌─ Shop ABC 🥇 Vàng ────────────────────────────────┐           │
│                          │ ⭐4.9 · 52k đơn · Khiếu nại 0,8% · Phản hồi ~3 phút│           │
│                          │ ● Đang online       [Xem shop] [Theo dõi]          │           │
│                          └───────────────────────────────────────────────────┘           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ [Mô tả] [Thông số] [Chính sách bảo hành] [Đánh giá (532)]                                │
│ Thông số: Quốc gia: VN · Năm tạo: 2015 · 2FA: Có · Định dạng: email|pass|recovery        │
│ Đánh giá: ▇▇▇▇▇▇▇▇ 5⭐ 87% │ ▇ 4⭐ 9% │ ... [Lọc: Có ảnh] [5⭐] [1⭐]                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Sản phẩm tương tự từ các gian hàng khác ...                                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Trang nhận hàng (sau khi mua):** bảng các item, mỗi dòng có nút 📋 Copy, nút "Copy tất cả", "Tải .txt", nút "Báo lỗi item này" (mở khiếu nại với item đã chọn sẵn), đồng hồ "Bảo hành còn 71:58:12".

### 4.4 Chợ yêu cầu và bình luận

```
Danh sách /yeu-cau
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Chợ yêu cầu                                                      [ + Đăng yêu cầu ]     │
│ [Tất cả danh mục ▾] [Ngân sách ▾] [● Đang mở ○ Đã chốt] Sắp xếp: [Mới nhất ▾]          │
│ ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 🟢 Đang mở · Tài khoản › MXH                                     ⏳ còn 2 ngày       │ │
│ │ Cần 200 tài khoản X đã xác minh, ưu tiên VN                                         │ │
│ │ 💰 2.000.000 – 3.000.000₫ · SL: 200 · bởi @nguyenvana · 3 giờ trước                 │ │
│ │ 💬 12 bình luận  ·  📨 5 báo giá  ·  👁 340                                          │ │
│ └─────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘

Chi tiết /yeu-cau/:id
┌──────────────────────────────────────────────────────────┬──────────────────────────────┐
│ Cần 200 tài khoản X đã xác minh, ưu tiên VN              │ Ngân sách 2tr – 3tr          │
│ @nguyenvana · ⭐ người mua uy tín · 3 giờ trước           │ Số lượng 200                 │
│ (nội dung mô tả, ảnh minh hoạ)                           │ Hạn chót 12/10/2026          │
│                                                          │ ─────────────────────────    │
│ [💬 Bình luận (12)] [📨 Báo giá (5)]                     │ [ 📨 Gửi báo giá ] (seller)  │
│ ───────────────────────────────────────────────────────  │ [ 💬 Nhắn người đăng ]       │
│ [Avatar] Viết bình luận...                     [Gửi]     │ [ ⚑ Báo cáo ]                │
│                                                          │                              │
│ ● Shop ABC 🥇 · 2 giờ trước                               │                              │
│   Bạn cần tài khoản tạo năm nào? Có cần 2FA không?       │                              │
│   ♡ 3  ·  Trả lời  ·  ⋯                                  │                              │
│   │                                                      │                              │
│   ├─ ● @nguyenvana (Tác giả) · 1 giờ trước               │                              │
│   │    @Shop ABC Năm 2018 trở về trước, cần 2FA          │                              │
│   │    ♡ 1 · Trả lời                                      │                              │
│   ├─ ● Shop ABC 🥇 · 50 phút trước                        │                              │
│   │    @nguyenvana OK mình có sẵn, đã gửi báo giá nhé    │                              │
│   └─ Xem thêm 4 trả lời ▾                                 │                              │
│                                                          │                              │
│ ● @tranb · 30 phút trước                                  │                              │
│   ...                                                    │                              │
└──────────────────────────────────────────────────────────┴──────────────────────────────┘
```

- Nhãn **"Tác giả"** cạnh tên người đăng bài trong bình luận. Huy hiệu cấp seller hiển thị cạnh tên seller.
- Bấm "Trả lời" ở bất kỳ đâu thì mở ô nhập ngay dưới nhánh đó, tự chèn `@tên`.
- Bình luận mới hiện realtime (không cần tải lại), có hiệu ứng nổi nhẹ.
- Tab **Báo giá**: thẻ báo giá gồm giá, thời gian giao, mô tả, thông tin seller, nút "Chấp nhận" (chủ bài) / "Nhắn tin".

### 4.5 Chat

```
┌───────────────────────────┬──────────────────────────────────────────┬──────────────────────┐
│ Tin nhắn        [🔍]      │ Shop ABC 🥇  ● online · phản hồi ~3 phút  │ Thông tin            │
│ [Tất cả][Chưa đọc][Hỗ trợ]│ ──────────────────────────────────────── │ ┌──────────────────┐ │
│ ┌───────────────────────┐ │ ┌─ Đang hỏi về sản phẩm ───────────────┐ │ │ [ảnh] Gmail 2015 │ │
│ │● Shop ABC   2 phút  ③ │ │ │ [ảnh] Gmail cổ 2015 · 15.000₫  [Mua] │ │ │ 15.000₫  [Mua]   │ │
│ │  Dạ còn bạn nhé...     │ │ └──────────────────────────────────────┘ │ └──────────────────┘ │
│ ├───────────────────────┤ │                                          │ Đơn liên quan:       │
│ │  Hỗ trợ viên Lan 1 giờ │ │            Shop còn hàng 2FA không? 14:02│ #DH8K2M · Hoàn tất   │
│ │  Yêu cầu nạp đã xử lý  │ │ Dạ còn bạn nhé, 1.204 cái     14:03      │                      │
│ ├───────────────────────┤ │                              Ok mua ✓✓   │ [Chặn] [Báo cáo]     │
│ │  Shop XYZ    hôm qua   │ │ ┌─ ⚠ Cảnh báo ──────────────────────────┐│                      │
│ │  ...                   │ │ │ Tin nhắn có thông tin liên hệ ngoài.   ││                      │
│ └───────────────────────┘ │ │ Giao dịch ngoài sàn KHÔNG được bảo vệ. ││                      │
│                           │ └────────────────────────────────────────┘│                      │
│                           │ Shop ABC đang nhập...                    │                      │
│                           │ [📎] [🖼] [🛒 Gửi thẻ đơn] Nhập tin nhắn… [➤]│                      │
└───────────────────────────┴──────────────────────────────────────────┴──────────────────────┘
```

- Trên mobile: 1 cột, chuyển trang giữa danh sách và hội thoại. Trên desktop còn có **popup chat nổi** góc phải khi đang xem sản phẩm.
- Nút **"Hỗ trợ"** nổi góc dưới phải mọi trang. Mở ra: chọn chủ đề, xem thời gian chờ dự kiến, rồi vào hội thoại hỗ trợ.

## 5. Seller Center: dashboard trực quan

### 5.1 Bố cục tổng quan

```
┌───────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ 🏪 Shop ABC   │ Tổng quan                         [Hôm nay|7 ngày|30 ngày|Tuỳ chọn ▾] so với kỳ trước│
│ 🥇 Vàng       ├──────────────────────────────────────────────────────────────────────────────┤
│               │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────┐│
│ 📊 Tổng quan  │ │ Doanh thu    │ │ Đơn hàng     │ │ Sẽ giải ngân │ │ Khả dụng     │ │Tỷ lệ KN  ││
│ 📦 Sản phẩm   │ │ 45,2 tr      │ │ 1.284        │ │ 8,4 tr       │ │ 12,1 tr      │ │ 0,8%     ││
│ 🗄 Kho hàng   │ │ ▲ 12% ╱╲╱‾   │ │ ▲ 8%  ╱‾╲╱   │ │ trong 24h tới│ │ [Rút tiền]   │ │ ▼ 0,2đ   ││
│ 🧾 Đơn hàng ⑤ │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────┘│
│ ⚠ Khiếu nại ② │ ┌───────────── Doanh thu & đơn hàng (30 ngày) ─────────────┐ ┌── Việc cần làm ──┐ │
│ 💰 Tài chính  │ │  tr                                         ▁ cột = đơn  │ │ 🔴 2 khiếu nại    │ │
│ ⭐ Đánh giá   │ │  3 ┤            ╱╲      ╱‾‾╲         ── đường = doanh thu │ │   còn 3h phản hồi │ │
│ 📨 Báo giá    │ │  2 ┤   ╱‾╲    ╱  ╲╱‾‾╱    ╲   ╱                         │ │ 🟠 5 đơn dịch vụ  │ │
│ 💬 Tin nhắn ⑦ │ │  1 ┤╱‾‾   ╲╱                ╲╱                           │ │   chờ nhận        │ │
│ 📣 Marketing  │ │    └▁▂▃▂▅▃▂▄▅▆▃▂▅▆▇▅▃▄▅▆▇█▆▅▄▅▆▇▅─────────────────────── │ │ 🟡 3 gói sắp hết  │ │
│ ⚙ Cài đặt    │ │    (hover: ngày, doanh thu, số đơn, so với kỳ trước)      │ │   kho (< 20)      │ │
│               │ └──────────────────────────────────────────────────────────┘ │ 🔵 7 tin chưa đọc │ │
│               │                                                              │ ⚪ 4 đánh giá chưa│ │
│               │                                                              │   phản hồi        │ │
│               │                                                              └──────────────────┘ │
│               │ ┌─ Đơn theo trạng thái ─┐ ┌─ Top sản phẩm (doanh thu) ───────────────────────────┐ │
│               │ │     ╭───╮  Hoàn tất 82%│ │ # Sản phẩm          Doanh thu  Đơn  Tồn   Chuyển đổi │ │
│               │ │    │ ◔ │  Bảo hành 12% │ │ 1 Gmail cổ 2015     18,2 tr    620  1.204 ▓▓▓▓░ 4,1% │ │
│               │ │     ╰───╯  Khiếu nại 2%│ │ 2 Proxy VN 30 ngày   9,4 tr    210    85  ▓▓▓░░ 3,2% │ │
│               │ │           Khác 4%      │ │ 3 ...                                                │ │
│               │ └────────────────────────┘ └──────────────────────────────────────────────────────┘ │
│               │ ┌─ Lịch giải ngân 7 ngày tới ────────────────┐ ┌─ Hiệu suất ────────────────────┐   │
│               │ │ T2 ▇▇▇ 2,1tr  T3 ▇▇▇▇▇ 3,4tr  T4 ▇▇ 1,2tr  │ │ Phản hồi chat TB: 3 phút  ✓    │   │
│               │ │ T5 ▇ 0,6tr  ...                            │ │ Đánh giá TB: 4,9 ⭐            │   │
│               │ └────────────────────────────────────────────┘ │ Tiến độ lên 💎: ▓▓▓▓▓▓░░ 76%   │   │
│               │                                                │  (cần thêm 1.200 đơn)          │   │
│               │                                                └────────────────────────────────┘   │
└───────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Danh sách widget Seller

| Widget | Loại biểu đồ | Dữ liệu | Tương tác |
|--------|-------------|---------|-----------|
| Thẻ KPI (5 thẻ) | Số lớn + % thay đổi + sparkline | Doanh thu thuần, số đơn, tiền sẽ giải ngân 24h, số dư khả dụng, tỷ lệ khiếu nại | Bấm thì đi tới trang chi tiết tương ứng |
| Doanh thu & đơn hàng | Kết hợp cột (đơn) + đường (doanh thu), có đường nét đứt của kỳ trước | `daily_store_stats` | Hover tooltip, bấm 1 ngày thì lọc danh sách đơn ngày đó |
| Việc cần làm | Danh sách ưu tiên có màu theo mức khẩn | Khiếu nại (đếm ngược), đơn dịch vụ chờ, kho sắp hết, tin chưa đọc, đánh giá chưa phản hồi | Bấm thì đến đúng chỗ xử lý |
| Đơn theo trạng thái | Donut | Tỷ lệ theo trạng thái | Bấm lát thì lọc đơn |
| Top sản phẩm | Bảng có thanh tiến độ nhỏ | Doanh thu, đơn, tồn, tỷ lệ chuyển đổi (đơn/lượt xem) | Sắp xếp theo cột |
| Lịch giải ngân | Cột theo ngày | `escrow_holds` theo `release_at` | Bấm cột thì xem đơn sẽ giải ngân |
| Hiệu suất & cấp độ | Thanh tiến độ + chỉ số | Thời gian phản hồi, đánh giá, tiến độ lên cấp | Liên kết "Cách lên cấp" |
| Nguồn truy cập (P3) | Cột ngang | Tìm kiếm, danh mục, chợ yêu cầu, link ngoài | |
| Giờ bán chạy (P3) | Heatmap 7 ngày × 24 giờ | Số đơn | Gợi ý giờ đẩy tin |

### 5.3 Trang nhập kho (trọng tâm với seller hàng tự động)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Nhập kho · Gmail cổ 2015 › Gói "1 tài khoản"            Tồn hiện tại: 1.204          │
│ Định dạng mỗi dòng: email|password|recovery      [Đổi định dạng]                     │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Dán dữ liệu vào đây, mỗi dòng 1 item…                                            │ │
│ │                                                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│ hoặc [📁 Tải file .txt/.csv]  (tối đa 50.000 dòng/lần)                                │
│                                                                                      │
│ Kết quả kiểm tra (trước khi lưu):                                                    │
│  ✅ Hợp lệ: 980     ⚠ Trùng trong lô: 12     ⛔ Đã có trong kho/đã bán: 8     ❌ Sai định dạng: 3│
│  [Xem chi tiết dòng lỗi ▾]                                                           │
│                                              [Huỷ]  [ Lưu 980 item vào kho ]         │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Danh sách đơn của seller

- Tabs theo trạng thái có số đếm: `Tất cả | Chờ nhận (5) | Đang làm | Đã giao | Khiếu nại (2) | Hoàn tất | Huỷ/Hoàn`.
- Bộ lọc: thời gian, sản phẩm, người mua, mã đơn. Xuất CSV.
- Mỗi dòng: mã đơn, người mua, sản phẩm × SL, tổng tiền, trạng thái (badge màu), **thời gian giải ngân còn lại**, hành động nhanh.

## 6. Admin: dashboard trực quan

### 6.1 Bố cục dashboard admin

```
┌──────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡 ADMIN      │ Dashboard        ● Live  [Hôm nay|7N|30N|Tuỳ chọn]   🔍 Ctrl+K  🔔 ③  [Lan · Finance]  │
│              ├─────────────────────────────────────────────────────────────────────────────────────┤
│ 📊 Dashboard │ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐            │
│ 👥 Người dùng│ │ GMV       ││ Doanh thu ││ Đơn hàng  ││ Người dùng││ Nạp tiền  ││ Rút tiền  │            │
│ 🏪 Seller  ⑧ │ │ 1,52 tỷ   ││ phí 76 tr ││ 12.480    ││ +342 mới  ││ 1,8 tỷ    ││ 0,9 tỷ    │            │
│ 🗂 Danh mục  │ │ ▲ 9% ╱‾╲╱ ││ ▲ 11%     ││ ▲ 6%      ││ 1.204 onl ││ 2.310 GD  ││ 86 lệnh   │            │
│ 📦 Sản phẩm⑫ │ └──────────┘└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘            │
│ 🧾 Đơn hàng  │ ┌──── Hàng chờ cần xử lý ─────────────────────────────────────────────────────────┐ │
│ ⚠ Khiếu nại⑥│ │ [⚠ 6 Khiếu nại leo thang · 2 sắp quá SLA] [💸 14 Lệnh rút chờ duyệt · 3 bị gắn cờ] │ │
│ 💰 Tài chính │ │ [🪪 8 Hồ sơ seller chờ duyệt] [📦 12 Sản phẩm chờ duyệt] [⚑ 21 Báo cáo vi phạm]   │ │
│ 💬 Hỗ trợ  ⑨ │ │ [💬 9 Khách đang chờ hỗ trợ · chờ lâu nhất 4 phút] [🔎 3 Nạp tiền chưa khớp]       │ │
│ ⚑ Vi phạm    │ └─────────────────────────────────────────────────────────────────────────────────┘ │
│ 🚨 Gian lận ③│ ┌──── GMV & doanh thu phí (30 ngày) ──────────────┐ ┌── Dòng tiền hôm nay ──────────┐ │
│ 📝 Nội dung  │ │ ▁▂▃▅▃▄▆▇▆▅▆▇█  (area: GMV, line: phí,          │ │ Nạp    ▇▇▇▇▇▇▇▇▇▇ 1,8 tỷ      │ │
│ 👮 Nhân sự   │ │                  nét đứt: kỳ trước)             │ │ Rút    ▇▇▇▇▇ 0,9 tỷ           │ │
│ 📜 Nhật ký   │ └─────────────────────────────────────────────────┘ │ Escrow đang giữ: 3,4 tỷ        │ │
│ ⚙ Cấu hình   │ ┌── GMV theo danh mục ──────────┐ ┌── Đơn theo giờ ─┐│ Đối soát hôm qua: ✅ khớp      │ │
│              │ │ Tài khoản ▇▇▇▇▇▇▇▇▇ 42%       │ │ heatmap 7×24     │└───────────────────────────────┘ │
│              │ │ Proxy/VPS ▇▇▇▇▇ 21%           │ │ ░▒▓█▓▒░ ...      │┌── Sức khoẻ hệ thống ──────────┐ │
│              │ │ Tool      ▇▇▇▇ 16%            │ │                  ││ API p95 120ms ✅ · Lỗi 0,1% ✅ │ │
│              │ │ Dịch vụ   ▇▇▇ 12% ...         │ │                  ││ Queue trễ 2s ✅ · WS 1.2k kết nối│ │
│              │ └───────────────────────────────┘ └──────────────────┘└───────────────────────────────┘ │
│              │ ┌── Top gian hàng (GMV) ─────────────────┐ ┌── Cảnh báo rủi ro mới ─────────────────┐  │
│              │ │ Shop ABC 💎  210 tr  ▲ · KN 0,6%        │ │ 🔴 user#… nạp 50tr rút ngay, 0 đơn      │  │
│              │ │ Shop XYZ 🥇  180 tr  ▼ · KN 3,9% ⚠      │ │ 🟠 5 tài khoản chung thiết bị, tự đánh giá│ │
│              │ └────────────────────────────────────────┘ └────────────────────────────────────────┘  │
└──────────────┴─────────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Danh sách widget Admin

| Widget | Loại | Mục đích |
|--------|------|---------|
| 6 thẻ KPI (GMV, doanh thu phí, đơn, người dùng mới/online, nạp, rút) | Số + delta + sparkline, cập nhật realtime 10 giây | Biết ngay tình hình |
| **Hàng chờ cần xử lý** | Các ô đếm lớn có màu theo SLA (xanh/vàng/đỏ) | Biết việc gì gấp. Bấm thì vào đúng hàng chờ |
| GMV & doanh thu phí | Area + line, so sánh kỳ trước | Xu hướng tăng trưởng |
| Dòng tiền hôm nay | Thanh ngang nạp/rút + escrow + trạng thái đối soát | Kiểm soát thanh khoản. Đối soát lệch thì đỏ |
| GMV theo danh mục | Thanh ngang (bar) xếp hạng | Danh mục nào mạnh |
| Đơn theo giờ | Heatmap ngày × giờ | Bố trí ca trực hỗ trợ |
| Phễu chuyển đổi (P3) | Funnel: xem → thêm/mua → thanh toán → hoàn tất không khiếu nại | Tối ưu UX |
| Top gian hàng | Bảng + tỷ lệ khiếu nại (cảnh báo khi > 3%) | Theo dõi seller lớn và seller rủi ro |
| Cảnh báo rủi ro | Danh sách mức độ | Chống gian lận |
| Sức khoẻ hệ thống | Đèn trạng thái | Phát hiện sự cố kỹ thuật (dữ liệu từ Prometheus) |
| Hiệu suất hỗ trợ (trang Hỗ trợ) | Thời gian phản hồi đầu, thời gian xử lý, CSAT theo nhân viên | Quản lý chất lượng CSKH |

### 6.3 Các màn hình admin quan trọng khác

**Hồ sơ người dùng 360°**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [Avatar] nguyenvana · ✉ ng***@gmail.com [Hiện] · Tham gia 01/03/2026 · 🟢 Active      │
│ Cờ rủi ro: [multi_account]   [Khoá] [Đóng băng ví] [Reset 2FA] [Ghi chú]              │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [Tổng quan] [Đơn mua] [Gian hàng] [Ví & sổ cái] [Đăng nhập] [Báo cáo] [Ghi chú] [Audit]│
│ Ví: khả dụng 1,2tr · escrow 0 · chờ rút 0      Đơn mua: 54 · KN: 2 (3,7%)             │
│ Đăng nhập gần nhất: 10/10 14:22 · IP 113.xx · Chrome/Win · VN                         │
│ Tài khoản liên quan (cùng thiết bị/IP/ngân hàng): @tranb, @lec  ⚠                    │
│ Dòng thời gian hoạt động: … (đăng ký → nạp → mua → khiếu nại …)                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Phân xử khiếu nại**: bố cục 3 cột:
- Trái: thông tin đơn, sản phẩm (bản chụp tại thời điểm mua), item bị khiếu nại.
- Giữa: dòng thời gian khiếu nại + chat 3 bên.
- Phải: lịch sử uy tín 2 bên (tỷ lệ khiếu nại của người mua, của seller), nút phán quyết (hoàn toàn bộ / một phần với thanh trượt số tiền / cho seller), ô ghi chú bắt buộc.

Nút "Xem nội dung item" bắt buộc nhập lý do.

**Duyệt rút tiền**: bảng với cột cờ rủi ro (🟢/🟠/🔴), số tiền, người rút, ngân hàng (trùng tên KYC ✓), lịch sử rút gần đây, nút "Duyệt" / "Giữ lại" / "Từ chối". Chọn nhiều để duyệt hàng loạt các lệnh xanh. Sau khi chuyển khoản thì nhập mã giao dịch ngân hàng.

**Cây danh mục & thuộc tính**: cây kéo thả bên trái. Bên phải là form danh mục + bảng thuộc tính (thêm/sửa, chọn kiểu UI lọc), có **xem trước bộ lọc** như người mua sẽ thấy.

### 6.4 Tiêu chuẩn chung cho bảng dữ liệu admin

- Phân trang server-side, sắp xếp mọi cột số/thời gian, bộ lọc nâng cao lưu được ("Bộ lọc đã lưu": ví dụ "Rút > 20tr bị gắn cờ").
- Chọn nhiều + thao tác hàng loạt (có xác nhận, ghi log).
- Cột tuỳ chỉnh ẩn/hiện, mật độ dòng (gọn/thoáng).
- Dữ liệu nhạy cảm che mặc định.
- **Command palette (Ctrl+K)**: gõ mã đơn, email, mã rút để nhảy thẳng tới.
- Phím tắt cho hàng chờ: `J/K` di chuyển, `A` duyệt, `R` từ chối (kèm hộp lý do).

## 7. Khả năng truy cập và hiệu năng

- WCAG 2.1 AA: tương phản màu, điều hướng bàn phím, `aria-label` cho icon, focus rõ ràng. Biểu đồ có bảng dữ liệu thay thế ("Xem dạng bảng").
- Core Web Vitals: LCP < 2,5s, INP < 200ms, CLS < 0,1. Ảnh WebP/AVIF có `srcset`, lazy load. Trang danh mục/sản phẩm SSR + cache CDN ngắn (30–60s) cho khách chưa đăng nhập.
- Bundle: tách code theo route, chart lib chỉ tải ở dashboard.
- Đa ngôn ngữ: chuẩn bị i18n (`next-intl`) từ đầu: tiếng Việt mặc định, tiếng Anh sau.

## 8. Quy trình thiết kế

1. Wireframe độ trung thực thấp (dựa trên phác thảo trong tài liệu này): 1 tuần.
2. Design system trên Figma (token màu, chữ, component theo shadcn): 1 tuần.
3. UI chi tiết các màn hình P1 (≈ 35 màn hình gồm mobile): 2–3 tuần, song song với dev backend.
4. Prototype click được cho các luồng: mua hàng, nhận hàng, khiếu nại, đăng bài & bình luận, chat, nhập kho, duyệt rút.
5. Thử nghiệm với 5–8 người dùng thật (người mua + seller MMO) trước khi code giao diện chính thức.
