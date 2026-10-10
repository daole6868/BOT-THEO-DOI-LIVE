'use client';
import { cn } from '@mmo/ui';
import { Bell, FileText, MessageCircle, Package, ShieldCheck, Store, User, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { useMe } from '@/lib/hooks';

const NAV = [
  { href: '/tai-khoan/don-hang', label: 'Đơn mua', icon: Package },
  { href: '/tai-khoan/vi', label: 'Ví & nạp tiền', icon: Wallet },
  { href: '/tai-khoan/tin-nhan', label: 'Tin nhắn', icon: MessageCircle },
  { href: '/tai-khoan/bai-dang', label: 'Bài yêu cầu', icon: FileText },
  { href: '/tai-khoan/thong-bao', label: 'Thông báo', icon: Bell },
  { href: '/tai-khoan/bao-mat', label: 'Bảo mật', icon: ShieldCheck },
  { href: '/tai-khoan/ho-so', label: 'Hồ sơ', icon: User },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data } = useMe();
  const store = data?.user?.store;
  const fullBleed = path.startsWith('/tai-khoan/tin-nhan');
  return (
    <RequireAuth>
      <div className="container-page py-6">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', path.startsWith(n.href) ? 'bg-primary-soft text-primary' : 'text-fg2 hover:bg-subtle')}>
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              ))}
              <Link href={store ? '/seller' : '/tai-khoan/dang-ky-ban-hang'} className={cn('mt-0 flex shrink-0 items-center gap-2.5 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-sm font-medium text-primary lg:mt-3', path.startsWith('/tai-khoan/dang-ky-ban-hang') && 'bg-primary-soft')}>
                <Store className="h-4 w-4" /> {store ? 'Seller Center' : 'Đăng ký bán hàng'}
              </Link>
            </nav>
          </aside>
          <div className={cn('min-w-0', fullBleed && 'lg:-mr-0')}>{children}</div>
        </div>
      </div>
    </RequireAuth>
  );
}
