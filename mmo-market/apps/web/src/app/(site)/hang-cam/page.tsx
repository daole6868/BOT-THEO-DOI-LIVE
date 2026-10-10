import { StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Danh mục hàng cấm' };

export default function Page() {
  return (
    <StaticPage title="Danh mục hàng cấm" updated="10/2026">
      <p>Sàn tự động chặn/kiểm duyệt nội dung chứa từ khoá cấm. Vi phạm sẽ bị khoá gian hàng và giữ tiền.</p>
      <ul>
        <li>Tài khoản bị hack, đánh cắp, chiếm đoạt; cookie/phiên đăng nhập lấy trộm.</li>
        <li>Thẻ ngân hàng, thẻ tín dụng, CVV; tài khoản ngân hàng/ví điện tử đứng tên người khác; dịch vụ thuê tài khoản ngân hàng.</li>
        <li>Dữ liệu cá nhân (data khách hàng, CCCD, danh sách SĐT/email); SIM đã đăng ký chính chủ người khác.</li>
        <li>Mã độc, phishing, ransomware, công cụ DDoS, công cụ bẻ khoá trái phép.</li>
        <li>Giấy tờ giả, hoá đơn giả, dịch vụ làm giả xác minh danh tính.</li>
        <li>Cờ bạc, cá độ, đa cấp, đầu tư lợi nhuận cố định, nội dung đồi truỵ, vi phạm bản quyền.</li>
      </ul>
    </StaticPage>
  );
}
