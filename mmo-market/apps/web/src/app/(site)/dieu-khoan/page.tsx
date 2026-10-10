import { StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Điều khoản sử dụng' };

export default function Page() {
  return (
    <StaticPage title="Điều khoản sử dụng" updated="10/2026">
      <h2>1. Tài khoản</h2>
      <p>Bạn chịu trách nhiệm bảo mật mật khẩu, mã 2FA và mã PIN. Không chia sẻ tài khoản. Sàn có quyền khoá tài khoản có dấu hiệu gian lận, đa tài khoản để lạm dụng, hoặc vi phạm pháp luật.</p>
      <h2>2. Ví & số dư</h2>
      <p>Số dư dùng để thanh toán trên sàn. Người bán rút doanh thu về tài khoản ngân hàng trùng tên đã xác minh. Sàn có quyền tạm giữ giao dịch bất thường để kiểm tra.</p>
      <h2>3. Hành vi bị cấm</h2>
      <ul>
        <li>Mua bán hàng cấm, tài khoản đánh cắp, dữ liệu cá nhân, công cụ tấn công.</li>
        <li>Giao dịch ngoài sàn, giả mạo nhân viên, lừa đảo, spam.</li>
        <li>Can thiệp, dò quét lỗ hổng trái phép. Báo cáo lỗ hổng qua security@mmomarket.local.</li>
      </ul>
      <h2>4. Giới hạn trách nhiệm</h2>
      <p>Sàn là bên trung gian; trách nhiệm chất lượng hàng thuộc về người bán. Cơ chế ký quỹ và khiếu nại giúp bảo vệ quyền lợi người mua trong thời gian bảo hành.</p>
    </StaticPage>
  );
}
