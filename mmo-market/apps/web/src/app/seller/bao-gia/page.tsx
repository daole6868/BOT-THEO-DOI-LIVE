'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, PageHeader, POST_STATUS, StatCard, StatusBadge, TD, TH, Table, Tabs, dateTime, pct, vnd } from '@mmo/ui';
import { CheckCircle2, Clock, Percent, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

const OFFER_STATUS = {
  PENDING: { label: 'Đang chờ', tone: 'warning' },
  ACCEPTED: { label: 'Được chọn', tone: 'success' },
  DECLINED: { label: 'Không được chọn', tone: 'neutral' },
  WITHDRAWN: { label: 'Đã rút', tone: 'neutral' },
} as const;

export default function SellerOffersPage() {
  const { data } = useQuery({ queryKey: ['seller-offers'], queryFn: () => api<any>('/seller/offers') });
  const [tab, setTab] = useState('');
  const s = data?.stats ?? {};
  const total = (s.PENDING ?? 0) + (s.ACCEPTED ?? 0) + (s.DECLINED ?? 0) + (s.WITHDRAWN ?? 0);
  const decided = (s.ACCEPTED ?? 0) + (s.DECLINED ?? 0);
  const items = (data?.items ?? []).filter((o: any) => !tab || o.status === tab);
  return (
    <div>
      <PageHeader title="Báo giá" subtitle="Các báo giá bạn đã gửi trên Chợ yêu cầu." actions={<Link href="/yeu-cau" className="text-sm font-medium text-primary hover:underline">Tìm yêu cầu mới →</Link>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Đã gửi" value={total} icon={<Send className="h-4 w-4" />} />
        <StatCard label="Đang chờ" value={s.PENDING ?? 0} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Được chọn" value={s.ACCEPTED ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Tỷ lệ chốt" value={decided ? pct((100 * (s.ACCEPTED ?? 0)) / decided) : '—'} icon={<Percent className="h-4 w-4" />} hint="Trên số báo giá đã có kết quả" />
      </div>
      <Card>
        <Tabs value={tab} onChange={setTab} className="px-3" items={[{ value: '', label: 'Tất cả' }, ...Object.entries(OFFER_STATUS).map(([k, v]) => ({ value: k, label: v.label, count: s[k] ?? 0 }))]} />
        {!items.length ? (
          <EmptyState title="Chưa có báo giá" description="Vào Chợ yêu cầu để tìm khách hàng đang cần dịch vụ của bạn." />
        ) : (
          <Table>
            <thead><tr><TH>Yêu cầu</TH><TH align="right">Giá</TH><TH>Thời gian làm</TH><TH>Trạng thái</TH><TH>Cập nhật</TH></tr></thead>
            <tbody>
              {items.map((o: any) => (
                <tr key={o.id} className="hover:bg-subtle/50">
                  <TD>
                    <Link href={`/yeu-cau/${o.post.id}`} className="line-clamp-1 font-medium hover:text-primary">{o.post.title}</Link>
                    <span className="mt-0.5 inline-flex"><StatusBadge map={POST_STATUS} value={o.post.status} /></span>
                  </TD>
                  <TD align="right" className="font-semibold">{vnd(o.price)}</TD>
                  <TD>{o.deliveryHours % 24 === 0 ? `${o.deliveryHours / 24} ngày` : `${o.deliveryHours} giờ`}</TD>
                  <TD>
                    <StatusBadge map={OFFER_STATUS as any} value={o.status} />
                    {o.orderId && o.status === 'ACCEPTED' && <Link href="/seller/don-hang" className="ml-2 text-xs text-primary">Xem đơn</Link>}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{dateTime(o.updatedAt)}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
