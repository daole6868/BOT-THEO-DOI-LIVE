'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, PageHeader, Pagination, StatusBadge, TD, TH, Table, dateTime, timeAgo } from '@mmo/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chips } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { APP_STATUS } from '@/lib/labels';

export default function ApplicationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['adm-apps', status, page], queryFn: () => api<any>(`/admin/seller-applications?page=${page}${status ? `&status=${status}` : ''}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Hồ sơ đăng ký bán hàng" subtitle="Xác minh danh tính (KYC) trước khi mở gian hàng. Hồ sơ cũ nhất hiển thị trước." />
      <Card>
        <div className="border-b border-border p-3">
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[...Object.entries(APP_STATUS).map(([k, v]) => ({ value: k, label: v.label })), { value: '', label: 'Tất cả' }]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có hồ sơ" description="Tất cả hồ sơ đã được xử lý." />
        ) : (
          <Table>
            <thead><tr><TH>Gian hàng đăng ký</TH><TH>Người nộp</TH><TH>Họ tên KYC</TH><TH>Ngân hàng</TH><TH>Trạng thái</TH><TH>Nộp lúc</TH></tr></thead>
            <tbody>
              {data.items.map((a: any) => (
                <tr key={a.id} className="cursor-pointer hover:bg-subtle/50" onClick={() => router.push(`/ho-so-ban-hang/${a.id}`)}>
                  <TD><p className="font-medium">{a.storeName}</p><p className="text-xs text-muted">/{a.storeSlug}</p></TD>
                  <TD>@{a.user.username}<p className="text-xs text-muted">tài khoản {timeAgo(a.user.createdAt)}</p>{a.user.riskFlags.length > 0 && <Badge tone="warning">{a.user.riskFlags.join(', ')}</Badge>}</TD>
                  <TD className="font-medium">{a.fullName}</TD>
                  <TD className="text-fg2">{a.bankName} ****{a.bankAccountLast4}</TD>
                  <TD><StatusBadge map={APP_STATUS} value={a.status} /></TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{dateTime(a.submittedAt)}</TD>
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
