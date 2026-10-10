'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, Countdown, DISPUTE_STATUS, EmptyState, PageHeader, Pagination, StatusBadge, TD, TH, Table, timeAgo, vnd } from '@mmo/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chips } from '@/components/Toolbar';
import { api } from '@/lib/api';

export default function DisputesPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['adm-disputes', status, page], queryFn: () => api<any>(`/admin/disputes?page=${page}${status ? `&status=${status}` : ''}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Khiếu nại" subtitle="Mặc định hiển thị các khiếu nại đang mở, cũ nhất trước. Khiếu nại trên 2 triệu cần vai trò Admin phân xử." />
      <Card>
        <div className="border-b border-border p-3">
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: '', label: 'Đang mở' }, { value: 'ESCALATED', label: 'Chờ admin' }, { value: 'OPEN', label: 'Chờ người bán' }, { value: 'SELLER_RESPONDED', label: 'Chờ người mua' }, { value: 'RESOLVED', label: 'Đã đóng' }]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có khiếu nại" />
        ) : (
          <Table>
            <thead><tr><TH>Đơn</TH><TH>Lý do</TH><TH>Gian hàng</TH><TH align="right">Giá trị</TH><TH>Trạng thái</TH><TH>Hạn / cập nhật</TH></tr></thead>
            <tbody>
              {data.items.map((d: any) => (
                <tr key={d.id} className="cursor-pointer hover:bg-subtle/50" onClick={() => router.push(`/khieu-nai/${d.id}`)}>
                  <TD><span className="font-mono text-xs text-primary">{d.order.code}</span><p className="line-clamp-1 max-w-[240px] text-xs text-muted">{d.order.title}</p></TD>
                  <TD className="font-medium">{d.reasonLabel}</TD>
                  <TD className="text-fg2">{d.order.store.name}</TD>
                  <TD align="right" className="whitespace-nowrap font-semibold">{vnd(d.order.total)}{Number(d.order.total) > 2_000_000 && <span className="ml-1 text-[10px] text-danger">ADMIN</span>}</TD>
                  <TD><StatusBadge map={DISPUTE_STATUS} value={d.status} /></TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{d.status === 'OPEN' ? <>NB còn <Countdown to={d.sellerDeadline} /></> : d.status === 'SELLER_RESPONDED' && d.buyerDeadline ? <>NM còn <Countdown to={d.buyerDeadline} /></> : timeAgo(d.updatedAt)}</TD>
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
