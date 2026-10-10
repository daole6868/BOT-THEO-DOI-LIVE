'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Spinner, cn } from '@mmo/ui';
import {
  AlertTriangle, BarChart3, ClipboardCheck, FileSearch, Flag, FolderTree, Headset, Landmark, LogOut, Menu, MessagesSquare, Package, Receipt, Settings, ShieldCheck, Store, UserCog, Users, X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';
import { ROLE_LABEL, useCan, useStaff } from '@/lib/hooks';
import { resetSocket } from '@/lib/socket';

type Q = Record<string, number>;
const GROUPS: { title: string; items: { href: string; label: string; icon: any; perm: string; badge?: (q: Q) => number; danger?: boolean }[] }[] = [
  { title: '', items: [{ href: '/', label: 'Tổng quan', icon: BarChart3, perm: 'dashboard.view' }] },
  {
    title: 'Vận hành',
    items: [
      { href: '/don-hang', label: 'Đơn hàng', icon: Receipt, perm: 'order.view' },
      { href: '/khieu-nai', label: 'Khiếu nại', icon: AlertTriangle, perm: 'dispute.resolve', badge: (q) => q.escalatedDisputes, danger: true },
      { href: '/ho-tro', label: 'Hỗ trợ trực tuyến', icon: Headset, perm: 'support.handle', badge: (q) => q.supportQueued, danger: true },
      { href: '/san-pham', label: 'Duyệt sản phẩm', icon: Package, perm: 'product.moderate', badge: (q) => q.productsPending },
      { href: '/ho-so-ban-hang', label: 'Hồ sơ người bán', icon: ClipboardCheck, perm: 'seller.review', badge: (q) => q.sellerApplications },
    ],
  },
  {
    title: 'Tài chính',
    items: [
      { href: '/tai-chinh', label: 'Nạp / rút & sổ cái', icon: Landmark, perm: 'ledger.view', badge: (q) => q.withdrawalsPending + q.withdrawalsOnHold + q.unmatchedDeposits + q.adjustmentsPending + q.depositClaims },
    ],
  },
  {
    title: 'Cộng đồng',
    items: [
      { href: '/cong-dong', label: 'Bài đăng & bình luận', icon: MessagesSquare, perm: 'community.moderate', badge: (q) => q.postsPending },
      { href: '/bao-cao', label: 'Báo cáo vi phạm', icon: Flag, perm: 'community.moderate', badge: (q) => q.reportsOpen },
    ],
  },
  {
    title: 'Dữ liệu',
    items: [
      { href: '/nguoi-dung', label: 'Người dùng', icon: Users, perm: 'user.view' },
      { href: '/gian-hang', label: 'Gian hàng', icon: Store, perm: 'user.view' },
      { href: '/danh-muc', label: 'Danh mục & thuộc tính', icon: FolderTree, perm: 'category.manage' },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { href: '/nhan-su', label: 'Nhân sự & phân quyền', icon: UserCog, perm: 'staff.manage' },
      { href: '/nhat-ky', label: 'Nhật ký kiểm toán', icon: FileSearch, perm: 'audit.view' },
      { href: '/cai-dat', label: 'Cấu hình & khẩn cấp', icon: Settings, perm: 'settings.manage' },
    ],
  },
];
// Kế toán có thể không có ledger.view nhưng có quyền rút/nạp
const FIN_PERMS = ['ledger.view', 'withdrawal.approve', 'withdrawal.pay', 'deposit.manage', 'adjustment.request'];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const { data, isLoading } = useStaff();
  const can = useCan();
  const router = useRouter();
  const path = usePathname();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const user = data?.user;
  const { data: q } = useQuery({ queryKey: ['queues'], queryFn: () => api<Q>('/admin/queues'), enabled: !!user, refetchInterval: 30_000 });

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);
  useEffect(() => setOpen(false), [path]);

  if (!user)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );

  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => null);
    resetSocket();
    qc.clear();
    router.replace('/login');
  };
  const allowed = (perm: string, href: string) => (href === '/tai-chinh' ? FIN_PERMS.some(can) : can(perm));

  const nav = (
    <nav className="space-y-5 px-3 py-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => allowed(i.perm, i.href));
        if (!items.length) return null;
        return (
          <div key={g.title || 'main'}>
            {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>}
            <div className="space-y-0.5">
              {items.map((i) => {
                const active = i.href === '/' ? path === '/' : path.startsWith(i.href);
                const n = q && i.badge ? i.badge(q) : 0;
                return (
                  <Link key={i.href} href={i.href} className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-primary-soft text-primary' : 'text-fg2 hover:bg-subtle hover:text-fg')}>
                    <i.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{i.label}</span>
                    {n > 0 && <span className={cn('ml-auto rounded-full px-1.5 text-[11px] font-bold tabular', i.danger ? 'bg-danger text-white' : 'bg-primary text-primary-fg')}>{n > 99 ? '99+' : n}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <Link href="/" className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={28} height={28} />
          MMO<span className="-ml-2 text-primary">Market</span>
          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">ADMIN</span>
        </Link>
        <div className="flex-1 overflow-y-auto">{nav}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-card">
            <div className="flex h-14 items-center justify-between border-b border-border px-4 font-bold">
              Quản trị
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng menu"><X className="h-5 w-5" /></button>
            </div>
            {nav}
          </div>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6">
          <button type="button" className="rounded-lg p-2 hover:bg-subtle lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
          <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex"><ShieldCheck className="h-4 w-4 text-success" /> Phiên đã xác thực 2FA</span>
          <div className="ml-auto flex items-center gap-2">
            <a href={process.env.NEXT_PUBLIC_WEB_URL} target="_blank" rel="noreferrer" className="hidden text-sm text-fg2 hover:text-primary sm:block">Mở trang bán hàng ↗</a>
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-lg px-2 py-1">
              <Avatar src={user.avatarUrl} name={user.displayName} size={30} />
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-[11px] text-muted">{ROLE_LABEL[user.role?.name ?? ''] ?? user.role?.name}</p>
              </div>
            </div>
            <button type="button" onClick={logout} className="rounded-lg p-2 text-fg2 hover:bg-danger-soft hover:text-danger" title="Đăng xuất" aria-label="Đăng xuất"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
