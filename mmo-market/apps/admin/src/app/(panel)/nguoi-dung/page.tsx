'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Card, EmptyState, LevelBadge, PageHeader, Pagination, StatusBadge, TD, TH, Table, dateOnly, timeAgo } from '@mmo/ui';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { USER_STATUS } from '@/lib/labels';

export default function UsersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(q && { q }), ...(status && { status }), ...(kind && { kind }) });
  const { data } = useQuery({ queryKey: ['adm-users', params.toString()], queryFn: () => api<any>(`/admin/users?${params}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Người dùng" subtitle="Email được che – bấm vào người dùng để xem hồ sơ 360°. Hiện email đầy đủ cần nhập lý do." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Email, username, tên, ID…" className="w-full sm:w-72" />
          <Chips value={kind} onChange={(v) => { setKind(v); setPage(1); }} items={[{ value: '', label: 'Tất cả' }, { value: 'seller', label: 'Người bán' }, { value: 'staff', label: 'Nhân sự' }, { value: 'flagged', label: 'Gắn cờ rủi ro' }]} />
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: '', label: 'Mọi trạng thái' }, ...Object.entries(USER_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không tìm thấy người dùng" />
        ) : (
          <Table>
            <thead><tr><TH>Người dùng</TH><TH>Email</TH><TH>Vai trò</TH><TH>2FA</TH><TH>Trạng thái</TH><TH>Rủi ro</TH><TH>Tham gia</TH><TH>Đăng nhập</TH></tr></thead>
            <tbody>
              {data.items.map((u: any) => (
                <tr key={u.id} className="cursor-pointer hover:bg-subtle/50" onClick={() => router.push(`/nguoi-dung/${u.id}`)}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.displayName} size={32} />
                      <div className="min-w-0"><p className="truncate font-medium">{u.displayName}</p><p className="text-xs text-muted">@{u.username}</p></div>
                    </div>
                  </TD>
                  <TD className="font-mono text-xs text-fg2">{u.email}</TD>
                  <TD>
                    {u.isStaff ? <Badge tone="primary">{u.role?.name ?? 'Nhân sự'}</Badge> : u.store ? <span className="flex items-center gap-1.5 text-xs">{u.store.name} <LevelBadge level={u.store.level} /></span> : <span className="text-xs text-muted">Người mua</span>}
                  </TD>
                  <TD>{u.mfaEnabled ? <ShieldCheck className="h-4 w-4 text-success" aria-label="Đã bật" /> : <ShieldOff className="h-4 w-4 text-muted" aria-label="Chưa bật" />}</TD>
                  <TD><StatusBadge map={USER_STATUS} value={u.status} /></TD>
                  <TD>{u.riskFlags.length ? <Badge tone="warning">{u.riskFlags.join(', ')}</Badge> : <span className="text-xs text-muted">—</span>}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{dateOnly(u.createdAt)}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
