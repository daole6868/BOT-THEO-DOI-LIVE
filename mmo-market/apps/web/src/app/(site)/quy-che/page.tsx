import { StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Quy chế hoạt động sàn' };

export default function Page() {
  return (
    <StaticPage title="Quy chế hoạt động sàn MMO Market" updated="10/2026">
      <h2>1. Nguyên tắc chung</h2>
      <p>MMO Market là sàn giao dịch thương mại điện tử cho phép người bán đã xác minh danh tính mở gian hàng và người mua thanh toán an toàn qua cơ chế ký quỹ (escrow).</p>
      <h2>2. Quy trình giao dịch</h2>
      <ul>
        <li>Người mua nạp tiền vào ví bằng chuyển khoản VietQR và thanh toán đơn hàng từ số dư.</li>
        <li>Tiền thanh toán được sàn giữ trong ký quỹ. Hàng số được giao tự động; dịch vụ được giao thủ công trong thời hạn cam kết.</li>
        <li>Hết thời gian bảo hành mà không có khiếu nại, tiền (sau phí sàn) được chuyển cho người bán.</li>
      </ul>
      <h2>3. Khiếu nại & hoàn tiền</h2>
      <p>Người mua có thể khiếu nại từng item trong thời gian bảo hành. Người bán có 12 giờ để đổi hàng, hoàn tiền hoặc giải trình; quá hạn hệ thống tự hoàn tiền. Hai bên có thể yêu cầu admin phân xử.</p>
      <h2>4. Trách nhiệm người bán</h2>
      <p>Cam kết nguồn gốc hợp pháp của hàng hoá, mô tả trung thực, bảo hành đúng cam kết, không đăng bán hàng cấm, không lôi kéo giao dịch ngoài sàn.</p>
      <h2>5. Xử lý vi phạm</h2>
      <p>Tuỳ mức độ: cảnh cáo, ẩn sản phẩm, tạm khoá gian hàng, giữ tiền ký quỹ để bồi hoàn cho người mua, khoá vĩnh viễn và cung cấp thông tin cho cơ quan chức năng khi có yêu cầu hợp pháp.</p>
      <h2>6. Phí</h2>
      <p>Phí giao dịch theo danh mục (hiển thị trong Seller Center), chỉ thu khi đơn hoàn tất. Không thu phí nạp tiền.</p>
    </StaticPage>
  );
}
