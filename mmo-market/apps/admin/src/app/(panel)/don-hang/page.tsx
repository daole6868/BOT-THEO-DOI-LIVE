'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, Countdown, EmptyState, ORDER_STATUS, PageHeader, Pagination, StatusBadge, TD, TH, Table, dateTime, vnd } from '@mmo/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';

export default function OrdersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(q && { q }), ...(status && { status }) });
  const { data } = useQuery({ queryKey: ['adm-orders', params.toString()], queryFn: () => api<any>(`/admin/orders?${params}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Đơn hàng" subtitle="Toàn bộ đơn trên sàn. Nội dung hàng số chỉ xem được khi phân xử và luôn ghi nhật ký." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Mã đơn, sản phẩm, người mua, shop" className="w-full sm:w-72" />
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: '', label: 'Tất cả' }, ...['PAID', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'REFUNDED', 'CANCELLED'].map((k) => ({ value: k, label: ORDER_STATUS[k]?.label ?? k }))]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có đơn hàng" />
        ) : (
          <Table>
            <thead><tr><TH>Mã đơn</TH><TH>Sản phẩm</TH><TH>Người mua</TH><TH>Gian hàng</TH><TH align="right">Tổng</TH><TH align="right">Phí sàn</TH><TH>Trạng thái</TH><TH>Ký quỹ</TH><TH>Thời gian</TH></tr></thead>
            <tbody>
              {data.items.map((o: any) => (
                <tr key={o.code} className="cursor-pointer hover:bg-subtle/50" onClick={() => router.push(`/don-hang/${o.code}`)}>
                  <TD className="font-mono text-xs text-primary">{o.code}</TD>
                  <TD><p className="line-clamp-1 max-w-[240px] font-medium">{o.title}</p><p className="text-xs text-muted">{o.variantName} × {o.qty}</p></TD>
                  <TD className="text-fg2">@{o.buyer.username}</TD>
                  <TD className="text-fg2">{o.store.name}</TD>
                  <TD align="right" className="whitespace-nowrap font-semibold">{vnd(o.total)}</TD>
                  <TD align="right" className="whitespace-nowrap text-muted">{vnd(o.feeAmount)}</TD>
                  <TD><StatusBadge map={ORDER_STATUS} value={o.status} /></TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{o.escrow?.status === 'HOLDING' && o.escrow.releaseAt ? <Countdown to={o.escrow.releaseAt} /> : o.escrow?.status ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{dateTime(o.createdAt)}</TD>
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
