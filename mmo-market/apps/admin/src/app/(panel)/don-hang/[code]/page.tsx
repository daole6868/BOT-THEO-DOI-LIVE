'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardBody, CardHeader, CopyButton, DISPUTE_STATUS, ORDER_STATUS, RESOLUTION, Skeleton, StatusBadge, dateTime, hoursLabel, vnd } from '@mmo/ui';
import { Eye, Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { REASON_LABEL } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

export default function OrderDetail() {
  const { code } = useParams<{ code: string }>();
  const can = useCan();
  const { run } = useRun();
  const { data: o } = useQuery({ queryKey: ['adm-order', code], queryFn: () => api<any>(`/admin/orders/${code}`) });
  const [revealOpen, setRevealOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; status: string; content: string }[] | null>(null);
  if (!o) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <Link href="/don-hang" className="text-xs text-muted hover:text-fg">← Đơn hàng</Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">Đơn {o.code} <CopyButton text={o.code} label="" /> <StatusBadge map={ORDER_STATUS} value={o.status} /></h1>
        <p className="text-sm text-muted">{dateTime(o.createdAt)} · nguồn {o.source === 'OFFER' ? 'báo giá chợ yêu cầu' : 'mua trực tiếp'}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={o.title} subtitle={`${o.variantName} × ${o.qty} · ${o.deliveryType === 'AUTO' ? 'Giao tự động' : 'Giao thủ công'}`} />
            <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-muted">Người mua</p><p className="font-medium">{o.buyer?.displayName} <span className="text-muted">@{o.buyer?.username}</span></p></div>
              <div><p className="text-xs text-muted">Gian hàng</p><p className="font-medium">{o.store?.name}</p></div>
              {o.buyerInput && <div className="sm:col-span-2"><p className="text-xs text-muted">Yêu cầu của người mua</p><p className="whitespace-pre-wrap">{o.buyerInput}</p></div>}
              {o.deliveryNote && <div className="sm:col-span-2"><p className="text-xs text-muted">Nội dung bàn giao</p><p className="whitespace-pre-wrap">{o.deliveryNote}</p></div>}
              {o.deliveryUploads?.length > 0 && (
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {o.deliveryUploads.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>)}
                </div>
              )}
            </CardBody>
          </Card>
          {o.deliveryType === 'AUTO' && (
            <Card>
              <CardHeader
                title="Item đã giao"
                subtitle={items ? 'Đang hiển thị nội dung thật – đã ghi nhật ký kiểm toán' : 'Nội dung được che. Chỉ mở khi cần phân xử.'}
                action={can('stock.view_content') && !items && <button type="button" onClick={() => setRevealOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Eye className="h-4 w-4" /> Xem nội dung</button>}
              />
              <ul className="divide-y divide-border">
                {(items ?? o.itemsMasked).map((it: any, i: number) => (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                    <span className="w-6 text-xs text-muted">{i + 1}</span>
                    <code className="flex-1 break-all font-mono text-xs">{items ? it.content : it.preview}</code>
                    {it.status !== 'SOLD' && <Badge tone="warning">{it.status}</Badge>}
                    {!items && <Lock className="h-3.5 w-3.5 text-muted" />}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {o.disputes.map((d: any) => (
            <Card key={d.id}>
              <CardHeader title={`Khiếu nại: ${REASON_LABEL[d.reason] ?? d.reason}`} action={<StatusBadge map={DISPUTE_STATUS} value={d.status} />} />
              <CardBody className="space-y-2 text-sm">
                <p className="whitespace-pre-wrap">{d.description}</p>
                {d.sellerMessage && <p><span className="text-muted">Người bán ({d.sellerAction}):</span> {d.sellerMessage}</p>}
                {d.resolution && <p className="font-medium">Kết quả: {RESOLUTION[d.resolution]} {d.refundAmount > 0 && `· hoàn ${vnd(d.refundAmount)}`}</p>}
                <Link href={`/khieu-nai/${d.id}`} className="text-primary hover:underline">Mở hồ sơ khiếu nại →</Link>
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Đơn giá</dt><dd className="tabular">{vnd(o.unitPrice)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Tổng</dt><dd className="font-semibold tabular">{vnd(o.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Phí sàn ({o.feeBps / 100}%)</dt><dd className="tabular">{vnd(o.feeAmount)}</dd></div>
              {o.refundedAmount > 0 && <div className="flex justify-between text-danger"><dt>Đã hoàn</dt><dd className="tabular">{vnd(o.refundedAmount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Bảo hành</dt><dd>{hoursLabel(o.warrantyHours)}</dd></div>
              {o.escrow && <div className="flex justify-between"><dt className="text-muted">Ký quỹ</dt><dd>{o.escrow.status} · {vnd(o.escrow.amount)}</dd></div>}
              {o.escrow?.releaseAt && <div className="flex justify-between"><dt className="text-muted">Giải ngân</dt><dd>{dateTime(o.escrow.releasedAt ?? o.escrow.releaseAt)}</dd></div>}
            </dl>
          </Card>
          <Card className="p-4">
            <p className="mb-3 font-semibold">Dòng thời gian</p>
            <ol className="relative space-y-3 border-l border-border pl-4 text-sm">
              {o.events.map((e: any, i: number) => (
                <li key={i}><span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" /><p>{e.message}</p><p className="text-xs text-muted">{dateTime(e.createdAt)} · {e.type}</p></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <ReasonModal
        open={revealOpen}
        onClose={() => setRevealOpen(false)}
        title="Xem nội dung hàng số"
        min={10}
        onSubmit={async (reason) => {
          await run('reveal', async () => setItems((await api<any>(`/admin/orders/${code}/reveal`, { body: { reason } })).items));
          setRevealOpen(false);
        }}
      >
        <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">Nội dung là dữ liệu nhạy cảm của khách hàng. Việc xem được ghi vào nhật ký kiểm toán kèm lý do và IP của bạn.</p>
      </ReasonModal>
    </div>
  );
}
