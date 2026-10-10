'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, DISPUTE_STATUS, Field, Input, Modal, RESOLUTION, Skeleton, StatusBadge, Textarea, cn, dateTime, pct, vnd } from '@mmo/ui';
import { Gavel, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

const ROLE: Record<string, { label: string; cls: string }> = {
  BUYER: { label: 'Người mua', cls: 'bg-info-soft text-info' },
  SELLER: { label: 'Người bán', cls: 'bg-warning-soft text-warning' },
  ADMIN: { label: 'Admin', cls: 'bg-primary-soft text-primary' },
  SYSTEM: { label: 'Hệ thống', cls: 'bg-subtle text-muted' },
};

export default function DisputeDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const { data: d, refetch } = useQuery({ queryKey: ['adm-dispute', id], queryFn: () => api<any>(`/admin/disputes/${id}`) });
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<{ resolution: string; amount: string; note: string }>({ resolution: 'REFUND_FULL', amount: '', note: '' });
  if (!d) return <Skeleton className="h-96" />;
  const max = Number(d.order.total) - Number(d.order.refundedAmount);

  const resolve = async () => {
    const ok = await run('resolve', () => api(`/admin/disputes/${id}/resolve`, { body: { resolution: res.resolution, note: res.note, amount: res.resolution === 'REFUND_PARTIAL' ? Number(res.amount.replace(/\D/g, '')) : undefined } }), 'Đã phân xử khiếu nại');
    if (ok) {
      setOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['queues'] });
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/khieu-nai" className="text-xs text-muted hover:text-fg">← Khiếu nại</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">{d.reasonLabel} <StatusBadge map={DISPUTE_STATUS} value={d.status} /></h1>
          <p className="text-sm text-muted">Đơn <Link href={`/don-hang/${d.order.code}`} className="font-mono text-primary">{d.order.code}</Link> · {d.order.title} · mở {dateTime(d.createdAt)}</p>
        </div>
        {d.status !== 'RESOLVED' && <Button onClick={() => setOpen(true)}><Gavel className="h-4 w-4" /> Phân xử</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Nội dung khiếu nại" />
            <CardBody className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{d.description}</p>
              {d.proposedRefund != null && <p className="text-muted">Người mua đề xuất hoàn: <b className="text-fg">{vnd(d.proposedRefund)}</b></p>}
              {d.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {d.attachments.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Bằng chứng" className="h-24 w-24 rounded-lg object-cover" /></a>)}
                </div>
              )}
              {d.resolution && <p className="rounded-lg bg-success-soft p-3 font-medium text-success">Kết quả: {RESOLUTION[d.resolution]}{Number(d.refundAmount) > 0 && ` · hoàn ${vnd(d.refundAmount)}`}{d.resolutionNote && ` — ${d.resolutionNote}`}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Diễn biến" subtitle="Tin nhắn của admin được gửi tới cả hai bên" />
            <ol className="space-y-3 px-5 pb-4">
              {d.events.map((e: any) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={cn('h-fit shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold', ROLE[e.actorRole]?.cls)}>{ROLE[e.actorRole]?.label ?? e.actorRole}</span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap">{e.message ?? e.type}</p>
                    {e.attachments?.length > 0 && <div className="mt-1 flex gap-1.5">{e.attachments.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer" className="text-xs text-primary underline">ảnh</a>)}</div>}
                    <p className="text-xs text-muted">{dateTime(e.createdAt)} · {e.type}</p>
                  </div>
                </li>
              ))}
            </ol>
            {d.status !== 'RESOLVED' && (
              <div className="flex gap-2 border-t border-border p-3">
                <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Nhắn cả hai bên (yêu cầu bằng chứng, giải thích…)" maxLength={2000} />
                <Button loading={busy === 'msg'} disabled={msg.trim().length < 2} onClick={() => run('msg', () => api(`/admin/disputes/${id}/message`, { body: { message: msg } }), 'Đã gửi').then((ok): unknown => ok && (setMsg(''), refetch()))}><Send className="h-4 w-4" /></Button>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 font-semibold">Giá trị</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Tổng đơn</dt><dd className="tabular">{vnd(d.order.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Đã hoàn</dt><dd className="tabular">{vnd(d.order.refundedAmount)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Có thể hoàn tối đa</dt><dd className="tabular">{vnd(max)}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Tín hiệu hỗ trợ quyết định" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-muted">Người mua</span><Link href={`/nguoi-dung/${d.order.buyer.id}`} className="text-primary">@{d.order.buyer.username}</Link></p>
              <p className="flex justify-between"><span className="text-muted">Tổng đơn đã mua</span><b>{d.signals.buyerOrders}</b></p>
              <p className="flex justify-between"><span className="text-muted">Số khiếu nại đã mở</span><b className={cn(d.signals.buyerDisputes > 3 && 'text-danger')}>{d.signals.buyerDisputes}</b></p>
              <hr className="border-border" />
              <p className="flex justify-between"><span className="text-muted">Gian hàng</span><span>{d.order.store.name}</span></p>
              <p className="flex justify-between"><span className="text-muted">Tỷ lệ khiếu nại shop</span><Badge tone={d.signals.storeDisputeRatePct > 3 ? 'danger' : 'neutral'}>{pct(d.signals.storeDisputeRatePct)}</Badge></p>
              {d.sellerAction && <p className="flex justify-between"><span className="text-muted">Người bán đã chọn</span><b>{d.sellerAction}</b></p>}
            </CardBody>
          </Card>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Phân xử khiếu nại" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button><Button loading={busy === 'resolve'} disabled={res.note.trim().length < 5 || (res.resolution === 'REFUND_PARTIAL' && !Number(res.amount.replace(/\D/g, '')))} onClick={resolve}>Xác nhận phán quyết</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-2">
            {[
              { v: 'REFUND_FULL', l: `Hoàn toàn bộ ${vnd(max)} cho người mua`, h: 'Item bị thu hồi, người bán bị tính khiếu nại' },
              { v: 'REFUND_PARTIAL', l: 'Hoàn một phần', h: 'Phần còn lại giải ngân cho người bán' },
              { v: 'REJECTED', l: 'Bác khiếu nại', h: 'Giải ngân toàn bộ cho người bán' },
            ].map((o) => (
              <label key={o.v} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', res.resolution === o.v ? 'border-primary bg-primary-soft' : 'border-border')}>
                <input type="radio" name="res" checked={res.resolution === o.v} onChange={() => setRes({ ...res, resolution: o.v })} className="mt-1" />
                <span><span className="block text-sm font-medium">{o.l}</span><span className="text-xs text-muted">{o.h}</span></span>
              </label>
            ))}
          </div>
          {res.resolution === 'REFUND_PARTIAL' && <Field label="Số tiền hoàn">{(fid) => <Input id={fid} inputMode="numeric" value={res.amount ? Number(res.amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setRes({ ...res, amount: e.target.value.replace(/\D/g, '') })} />}</Field>}
          <Field label="Lý do phán quyết (gửi cho hai bên)">{(fid) => <Textarea id={fid} rows={3} value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} maxLength={2000} />}</Field>
        </div>
      </Modal>
    </div>
  );
}
