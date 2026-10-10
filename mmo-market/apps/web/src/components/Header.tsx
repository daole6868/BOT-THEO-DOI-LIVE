'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Dropdown, MenuItem, shortVnd, timeAgo } from '@mmo/ui';
import { Bell, ChevronDown, LayoutGrid, LogOut, Menu, MessageCircle, Package, ShieldCheck, Store, User, Wallet, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { useCategories, useMe, useWallet } from '@/lib/hooks';
import { CategoryIcon } from '@/lib/icons';
import { resetSocket } from '@/lib/socket';
import { Logo } from './Logo';
import { SearchBox } from './SearchBox';
import { ThemeToggle } from './ThemeToggle';
import { Sheet } from '@mmo/ui';

function CategoryMenu() {
  const { data } = useCategories();
  return (
    <Dropdown
      align="left"
      panelClassName="w-[min(92vw,720px)] p-3"
      trigger={(open) => (
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-fg2 hover:bg-subtle">
          <LayoutGrid className="h-4 w-4" /> Danh mục <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    >
      {(close) => (
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
          {data?.map((c) => (
            <div key={c.id}>
              <Link href={`/danh-muc/${c.slug}`} onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-semibold text-fg hover:bg-subtle">
                <CategoryIcon name={c.icon} className="h-4 w-4 text-primary" /> {c.name}
              </Link>
              <ul className="mt-0.5">
                {c.children.map((ch) => (
                  <li key={ch.id}>
                    <Link href={`/danh-muc/${ch.slug}`} onClick={close} className="flex justify-between rounded-md px-2 py-1 pl-8 text-[13px] text-fg2 hover:bg-subtle hover:text-fg">
                      <span>{ch.name}</span>
                      <span className="text-muted tabular">{ch.productCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

function NotificationBell({ unread }: { unread: number }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ items: any[]; unreadCount: number }>('/notifications'), enabled: open });
  const readAll = async () => {
    await api('/notifications/read', { body: { all: true } });
    qc.setQueryData(['me'], (old: any) => (old ? { ...old, unreadNotifications: 0 } : old));
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <Dropdown
      panelClassName="w-[min(92vw,380px)] p-0"
      trigger={() => (
        <button type="button" onClick={() => setOpen(true)} className="relative rounded-lg p-2 text-fg2 hover:bg-subtle" aria-label="Thông báo">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-semibold">Thông báo</span>
            <button type="button" onClick={readAll} className="text-xs text-primary hover:underline">
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!data?.items.length && <p className="p-6 text-center text-sm text-muted">Chưa có thông báo</p>}
            {data?.items.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={async () => {
                  close();
                  if (!n.readAt) await api('/notifications/read', { body: { ids: [n.id] } }).catch(() => undefined);
                  qc.invalidateQueries({ queryKey: ['me'] });
                  if (n.link) router.push(n.link);
                }}
                className={`flex w-full gap-3 border-b border-border px-4 py-3 text-left hover:bg-subtle ${n.readAt ? '' : 'bg-primary-soft/50'}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-primary'}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                  <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link href="/tai-khoan/thong-bao" onClick={close} className="block px-4 py-2.5 text-center text-sm text-primary hover:bg-subtle">
            Xem tất cả
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

function UserMenu() {
  const { data } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const user = data!.user!;
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    resetSocket();
    qc.clear();
    router.push('/');
    router.refresh();
  };
  return (
    <Dropdown
      trigger={() => (
        <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-subtle" aria-label="Tài khoản">
          <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
          <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
        </button>
      )}
    >
      {(close) => (
        <div onClick={close}>
          <div className="px-3 py-2">
            <p className="font-semibold text-fg">{user.displayName}</p>
            <p className="text-xs text-muted">@{user.username}</p>
          </div>
          <div className="my-1 border-t border-border" />
          {user.store ? (
            <MenuItem icon={<Store className="h-4 w-4" />} onClick={() => router.push('/seller')}>
              Seller Center
            </MenuItem>
          ) : (
            <MenuItem icon={<Store className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/dang-ky-ban-hang')}>
              Đăng ký bán hàng
            </MenuItem>
          )}
          <MenuItem icon={<Package className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/don-hang')}>
            Đơn mua
          </MenuItem>
          <MenuItem icon={<Wallet className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/vi')}>
            Ví & nạp tiền
          </MenuItem>
          <MenuItem icon={<MessageCircle className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/tin-nhan')}>
            Tin nhắn
          </MenuItem>
          <MenuItem icon={<FileText className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/bai-dang')}>
            Bài yêu cầu của tôi
          </MenuItem>
          <MenuItem icon={<ShieldCheck className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/bao-mat')}>
            Bảo mật {!user.mfaEnabled && <span className="ml-auto rounded bg-warning-soft px-1.5 text-[10px] text-warning">Chưa bật 2FA</span>}
          </MenuItem>
          <MenuItem icon={<User className="h-4 w-4" />} onClick={() => router.push('/tai-khoan/ho-so')}>
            Hồ sơ
          </MenuItem>
          <div className="my-1 border-t border-border" />
          <MenuItem icon={<LogOut className="h-4 w-4" />} danger onClick={logout}>
            Đăng xuất
          </MenuItem>
        </div>
      )}
    </Dropdown>
  );
}

function ChatIcon() {
  const { data } = useQuery({ queryKey: ['chat-unread'], queryFn: () => api<{ count: number }>('/chat/unread'), refetchInterval: 60_000 });
  return (
    <Link href="/tai-khoan/tin-nhan" className="relative rounded-lg p-2 text-fg2 hover:bg-subtle" aria-label="Tin nhắn">
      <MessageCircle className="h-5 w-5" />
      {!!data?.count && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[18px] text-primary-fg">{data.count > 99 ? '99+' : data.count}</span>}
    </Link>
  );
}

export function Header() {
  const { data, isLoading } = useMe();
  const user = data?.user;
  const { data: wallet } = useWallet(!!user);
  const [mobile, setMobile] = useState(false);
  const { data: cats } = useCategories();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="container-page flex h-16 items-center gap-3">
        <button type="button" className="rounded-lg p-2 text-fg2 hover:bg-subtle lg:hidden" onClick={() => setMobile(true)} aria-label="Mở menu">
          <Menu className="h-5 w-5" />
        </button>
        <Logo />
        <nav className="ml-2 hidden items-center lg:flex">
          <CategoryMenu />
          <Link href="/yeu-cau" className="rounded-lg px-3 py-2 text-sm font-medium text-fg2 hover:bg-subtle">
            Chợ yêu cầu
          </Link>
        </nav>
        <Suspense fallback={<div className="hidden flex-1 md:block" />}>
          <SearchBox className="mx-2 hidden flex-1 md:block" />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {isLoading ? null : user ? (
            <>
              <ChatIcon />
              <NotificationBell unread={data?.unreadNotifications ?? 0} />
              <Link href="/tai-khoan/vi" className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-semibold text-fg hover:border-primary/50 sm:inline-flex" title="Số dư khả dụng">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="tabular">{wallet ? shortVnd(wallet.available) : '…'}</span>
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/dang-nhap">
                <Button variant="ghost" size="sm">
                  Đăng nhập
                </Button>
              </Link>
              <Link href="/dang-ky" className="hidden sm:block">
                <Button size="sm">Đăng ký</Button>
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="container-page pb-3 md:hidden">
        <Suspense>
          <SearchBox />
        </Suspense>
      </div>
      <Sheet open={mobile} onClose={() => setMobile(false)} title="Menu" side="left">
        <nav className="space-y-1" onClick={() => setMobile(false)}>
          <Link href="/" className="block rounded-lg px-3 py-2 font-medium hover:bg-subtle">
            Trang chủ
          </Link>
          <Link href="/yeu-cau" className="block rounded-lg px-3 py-2 font-medium hover:bg-subtle">
            Chợ yêu cầu
          </Link>
          {user?.store && (
            <Link href="/seller" className="block rounded-lg px-3 py-2 font-medium hover:bg-subtle">
              Seller Center
            </Link>
          )}
          <p className="px-3 pt-3 text-xs font-semibold uppercase text-muted">Danh mục</p>
          {cats?.map((c) => (
            <Link key={c.id} href={`/danh-muc/${c.slug}`} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-subtle">
              <CategoryIcon name={c.icon} className="h-4 w-4 text-primary" /> {c.name}
            </Link>
          ))}
        </nav>
      </Sheet>
    </header>
  );
}
