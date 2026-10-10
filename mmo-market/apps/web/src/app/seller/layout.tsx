'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, LevelBadge, Spinner, cn } from '@mmo/ui';
import { AlertTriangle, BarChart3, Boxes, MessageCircle, Package, Receipt, Send, Settings, ShieldCheck, Star, Store, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Header } from '@/components/Header';
import { MfaSetup } from '@/components/MfaSetup';
import { RequireAuth } from '@/components/RequireAuth';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';

const NAV = [
  { href: '/seller', label: 'Tổng quan', icon: BarChart3, exact: true },
  { href: '/seller/san-pham', label: 'Sản phẩm', icon: Package },
  { href: '/seller/kho', label: 'Kho hàng', icon: Boxes },
  { href: '/seller/don-hang', label: 'Đơn hàng', icon: Receipt, badge: 'orders' },
  { href: '/seller/khieu-nai', label: 'Khiếu nại', icon: AlertTriangle, badge: 'disputes' },
  { href: '/seller/tai-chinh', label: 'Tài chính', icon: Wallet },
  { href: '/seller/danh-gia', label: 'Đánh giá', icon: Star },
  { href: '/seller/bao-gia', label: 'Báo giá', icon: Send },
  { href: '/tai-khoan/tin-nhan', label: 'Tin nhắn', icon: MessageCircle },
  { href: '/seller/cai-dat', label: 'Cài đặt gian hàng', icon: Settings },
];

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: me } = useMe();
  const [mfaOpen, setMfaOpen] = useState(false);
  const u = me?.user;
  const { data: counts } = useQuery({
    queryKey: ['seller-counts'],
    queryFn: () => api<any>('/seller/orders?pageSize=1'),
    enabled: !!u?.store && !!u?.mfaEnabled,
    refetchInterval: 60_000,
  });
  if (!u) return null;
  if (!u.store)
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState icon={<Store className="h-6 w-6" />} title="Bạn chưa có gian hàng" description="Đăng ký bán hàng để mở Seller Center." action={<Link href="/tai-khoan/dang-ky-ban-hang"><Button>Đăng ký bán hàng</Button></Link>} />
      </Card>
    );
  if (!u.mfaEnabled)
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Cần bật xác thực 2 lớp" description="Người bán bắt buộc bật 2FA để bảo vệ doanh thu và tài khoản rút tiền." action={<Button onClick={() => setMfaOpen(true)}>Bật 2FA ngay</Button>} />
        <MfaSetup open={mfaOpen} onClose={() => setMfaOpen(false)} />
      </Card>
    );
  const badge = (k?: string) => (k === 'orders' ? (counts?.counts?.PAID ?? 0) : k === 'disputes' ? (counts?.counts?.DISPUTED ?? 0) : 0);
  return (
    <div className="container-page py-6">
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="mb-3 hidden items-center gap-2 rounded-xl border border-border bg-card p-3 lg:flex">
            <Store className="h-5 w-5 text-primary" />
            <div className="min-w-0">
              <Link href={`/shop/${u.store.slug}`} className="block truncate text-sm font-semibold hover:text-primary">{u.store.name}</Link>
              <LevelBadge level={u.store.level} />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
            {NAV.map((n) => {
              const active = n.exact ? path === n.href : path.startsWith(n.href);
              const b = badge(n.badge);
              return (
                <Link key={n.href} href={n.href} className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-primary-soft text-primary' : 'text-fg2 hover:bg-subtle')}>
                  <n.icon className="h-4 w-4" /> {n.label}
                  {b > 0 && <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-bold', n.badge === 'disputes' ? 'bg-danger text-white' : 'bg-primary text-primary-fg')}>{b}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <RequireAuth verified>
        <Shell>{children}</Shell>
      </RequireAuth>
    </>
  );
}
