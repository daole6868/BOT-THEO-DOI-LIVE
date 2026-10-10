'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ORDER_STATUS, PageHeader, Pagination, Skeleton, StatusBadge, Tabs, dateTime, vnd } from '@mmo/ui';
import { Package } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DeliveryTag } from '@/components/ProductCard';
import { api } from '@/lib/api';

const TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'DELIVERED', label: 'Đang bảo hành' },
  { value: 'IN_PROGRESS', label: 'Đang thực hiện' },
  { value: 'DISPUTED', label: 'Khiếu nại' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'REFUNDED', label: 'Hoàn tiền' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['orders', status, page], queryFn: () => api<any>(`/orders?page=${page}${status ? `&status=${status}` : ''}`) });
  return (
    <div>
      <PageHeader title="Đơn mua" subtitle="Hàng số được giao ngay trong đơn. Tiền được giữ an toàn tới khi hết bảo hành." />
      <Card>
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={TABS} className="px-3" />
        {isLoading ? (
          <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="Chưa có đơn hàng" action={<Link href="/" className="text-primary hover:underline">Khám phá sản phẩm</Link>} />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((o: any) => (
              <li key={o.code}>
                <Link href={`/tai-khoan/don-hang/${o.code}`} className="flex gap-3 p-4 hover:bg-subtle/60">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {o.image && <img src={o.image} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted tabular">{o.code}</span>
                      <StatusBadge map={ORDER_STATUS} value={o.status} />
                      <DeliveryTag type={o.deliveryType} />
                    </div>
                    <p className="mt-1 truncate font-medium">{o.title}</p>
                    <p className="text-xs text-muted">{o.store?.name} · {o.variantName} × {o.qty} · {dateTime(o.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular">{vnd(o.total)}</p>
                    {o.refundedAmount > 0 && <p className="text-xs text-success">Hoàn {vnd(o.refundedAmount)}</p>}
                    {o.status === 'COMPLETED' && !o.reviewed && <p className="mt-1 text-xs text-primary">Viết đánh giá →</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
