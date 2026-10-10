import Link from 'next/link';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-muted">Sàn giao dịch sản phẩm & dịch vụ MMO. Tiền được giữ an toàn qua ký quỹ, lỗi được đổi/hoàn tự động.</p>
        </div>
        <div>
          <p className="mb-3 font-semibold">Mua hàng</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/huong-dan" className="hover:text-fg">Hướng dẫn mua hàng</Link></li>
            <li><Link href="/yeu-cau" className="hover:text-fg">Chợ yêu cầu</Link></li>
            <li><Link href="/tai-khoan/vi" className="hover:text-fg">Nạp tiền</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">Bán hàng</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/tai-khoan/dang-ky-ban-hang" className="hover:text-fg">Mở gian hàng</Link></li>
            <li><Link href="/hang-cam" className="hover:text-fg">Danh mục hàng cấm</Link></li>
            <li><Link href="/seller" className="hover:text-fg">Seller Center</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">Chính sách</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/quy-che" className="hover:text-fg">Quy chế hoạt động sàn</Link></li>
            <li><Link href="/dieu-khoan" className="hover:text-fg">Điều khoản sử dụng</Link></li>
            <li><Link href="/chinh-sach-bao-mat" className="hover:text-fg">Chính sách bảo mật</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} MMO Market · Nhân viên không bao giờ hỏi mật khẩu, mã 2FA hay yêu cầu chuyển khoản riêng.
      </div>
    </footer>
  );
}
