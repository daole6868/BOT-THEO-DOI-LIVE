'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Card, Countdown, EmptyState, Input, ORDER_STATUS, PageHeader, Pagination, StatusBadge, TD, TH, Table, Tabs, dateTime, vnd } from '@mmo/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DeliveryTag } from '@/components/ProductCard';
import { api } from '@/lib/api';

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const status = params.get('status') ?? '';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['seller-orders', status, q, page], queryFn: () => api<any>(`/seller/orders?page=${page}${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`), placeholderData: keepPreviousData });
  const c = data?.counts ?? {};
  const exportCsv = () => {
    if (!data) return;
    const rows = [['Mã đơn', 'Sản phẩm', 'Gói', 'SL', 'Tổng tiền', 'Trạng thái', 'Ngày tạo'], ...data.items.map((o: any) => [o.code, o.title, o.variantName, o.qty, o.total, ORDER_STATUS[o.status]?.label, dateTime(o.createdAt)])];
    const csv = '﻿' + rows.map((r) => r.map((x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `don-hang-${Date.now()}.csv`;
    a.click();
  };
  return (
    <div>
      <PageHeader title="Đơn hàng" actions={<button type="button" onClick={exportCsv} className="text-sm text-primary hover:underline">Xuất CSV trang này</button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3">
          <Tabs
            value={status}
            onChange={(v) => { setPage(1); router.replace(v ? `${path}?status=${v}` : path); }}
            className="border-0"
            items={[
              { value: '', label: 'Tất cả' },
              { value: 'PAID', label: 'Chờ nhận', count: c.PAID ?? 0 },
              { value: 'IN_PROGRESS', label: 'Đang làm', count: c.IN_PROGRESS ?? 0 },
              { value: 'DELIVERED', label: 'Đã giao', count: c.DELIVERED ?? 0 },
              { value: 'DISPUTED', label: 'Khiếu nại', count: c.DISPUTED ?? 0 },
              { value: 'COMPLETED', label: 'Hoàn tất', count: c.COMPLETED ?? 0 },
              { value: 'REFUNDED', label: 'Hoàn tiền', count: c.REFUNDED ?? 0 },
            ]}
          />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Mã đơn / tên sản phẩm" className="my-2 ml-auto h-9 w-56" />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có đơn hàng" />
        ) : (
          <Table>
            <thead><tr><TH>Mã đơn</TH><TH>Sản phẩm</TH><TH>Người mua</TH><TH align="right">Tổng</TH><TH>Trạng thái</TH><TH>Giải ngân</TH><TH>Ngày</TH></tr></thead>
            <tbody>
              {data.items.map((o: any) => (
                <tr key={o.code} className="cursor-pointer hover:bg-subtle/50" onClick={() => router.push(`/seller/don-hang/${o.code}`)}>
                  <TD className="font-mono text-xs"><Link href={`/seller/don-hang/${o.code}`} className="text-primary">{o.code}</Link></TD>
                  <TD><p className="line-clamp-1 font-medium">{o.title}</p><p className="flex items-center gap-1.5 text-xs text-muted"><DeliveryTag type={o.deliveryType} /> {o.variantName} × {o.qty}</p></TD>
                  <TD className="text-fg2">{o.buyer?.displayName}</TD>
                  <TD align="right" className="font-semibold">{vnd(o.total)}</TD>
                  <TD><StatusBadge map={ORDER_STATUS} value={o.status} /></TD>
                  <TD className="text-xs text-muted">{o.escrowStatus === 'HOLDING' && o.releaseAt ? <Countdown to={o.releaseAt} /> : o.escrowStatus === 'FROZEN' ? 'Đóng băng' : o.escrowStatus === 'RELEASED' ? 'Đã nhận' : '—'}</TD>
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

export default function SellerOrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
