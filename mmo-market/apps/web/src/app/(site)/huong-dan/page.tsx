import { StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Hướng dẫn' };

export default function Page() {
  return (
    <StaticPage title="Hướng dẫn mua & bán">
      <h2>Mua hàng</h2>
      <ol>
        <li>Đăng ký, xác minh email, bật 2FA (khuyến nghị).</li>
        <li>Nạp tiền: Ví → Nạp tiền → quét mã VietQR, chuyển đúng nội dung. Tiền vào ví sau vài giây.</li>
        <li>Chọn sản phẩm → Mua ngay. Hàng tự động hiện trong trang đơn hàng.</li>
        <li>Kiểm tra hàng; lỗi thì bấm “Báo lỗi” để khiếu nại trong thời gian bảo hành.</li>
      </ol>
      <h2>Bán hàng</h2>
      <ol>
        <li>Bật 2FA → Đăng ký bán hàng (CCCD + tài khoản ngân hàng trùng tên).</li>
        <li>Sau khi duyệt: Seller Center → Sản phẩm → Tạo sản phẩm → Nhập kho (mỗi dòng 1 item).</li>
        <li>Tiền về ví sau thời gian bảo hành. Rút về ngân hàng trong mục Tài chính (cần 2FA + PIN).</li>
      </ol>
    </StaticPage>
  );
}
