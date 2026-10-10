import { StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Chính sách bảo mật' };

export default function Page() {
  return (
    <StaticPage title="Chính sách bảo mật & xử lý dữ liệu cá nhân" updated="10/2026">
      <h2>Dữ liệu chúng tôi thu thập</h2>
      <ul>
        <li>Người mua: email, tên hiển thị, lịch sử giao dịch, nhật ký đăng nhập (IP, thiết bị).</li>
        <li>Người bán: thêm giấy tờ tuỳ thân (KYC), tài khoản ngân hàng nhận tiền.</li>
      </ul>
      <h2>Cách chúng tôi bảo vệ</h2>
      <ul>
        <li>Mật khẩu băm argon2id; 2FA; phiên đăng nhập có thể thu hồi.</li>
        <li>Hàng số, số tài khoản ngân hàng, khoá 2FA được mã hoá AES-256-GCM. Số CCCD chỉ lưu dạng băm + 4 số cuối.</li>
        <li>Ảnh KYC lưu kho riêng tư, chỉ nhân sự có thẩm quyền xem và mọi lần xem đều ghi nhật ký kiểm toán.</li>
      </ul>
      <h2>Tin nhắn</h2>
      <p>Tin nhắn không mã hoá đầu cuối để làm bằng chứng khi có tranh chấp. Nhân sự chỉ xem hội thoại khi có khiếu nại hoặc báo cáo liên quan, và việc xem được ghi nhật ký.</p>
      <h2>Quyền của bạn</h2>
      <p>Bạn có quyền xem, sửa, yêu cầu xoá dữ liệu cá nhân (dữ liệu giao dịch được lưu theo nghĩa vụ kế toán, thuế). Liên hệ bộ phận hỗ trợ trên sàn.</p>
    </StaticPage>
  );
}
