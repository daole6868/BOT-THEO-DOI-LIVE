'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Countdown, CopyButton, DISPUTE_STATUS, Field, Modal, ORDER_STATUS, Skeleton, StatusBadge, Textarea, dateTime, hoursLabel, useToast, vnd } from '@mmo/ui';
import { CheckCircle2, MessageCircle, PackageCheck, Truck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, errMsg } from '@/lib/api';

export default function SellerOrderDetail() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: o, refetch } = useQuery({ queryKey: ['seller-order', code], queryFn: () => api<any>(`/seller/orders/${code}`) });
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  if (!o) return <Skeleton className="h-96" />;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setDeliverOpen(false);
      setRejectOpen(false);
      setNote('');
      refetch();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const net = o.total - o.refundedAmount - Math.floor(((o.total - o.refundedAmount) * o.feeBps) / 10000);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/seller/don-hang" className="text-xs text-muted hover:text-fg">← Đơn hàng</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">Đơn {o.code} <CopyButton text={o.code} label="" /> <StatusBadge map={ORDER_STATUS} value={o.status} /></h1>
          <p className="text-sm text-muted">{dateTime(o.createdAt)} · Người mua: {o.buyer.displayName} (@{o.buyer.username})</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={async () => { const c = await api<{ id: string }>('/chat/conversations', { body: { peerUserId: o.buyer.id, context: { type: 'order', id: o.code } } }); router.push(`/tai-khoan/tin-nhan?c=${c.id}`); }}>
            <MessageCircle className="h-4 w-4" /> Nhắn người mua
          </Button>
          {o.status === 'PAID' && (
            <>
              <Button size="sm" variant="success" loading={busy} onClick={() => run(() => api(`/seller/orders/${code}/accept`, { method: 'POST' }), 'Đã nhận đơn')}><PackageCheck className="h-4 w-4" /> Nhận đơn</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRejectOpen(true)}><XCircle className="h-4 w-4" /> Từ chối</Button>
            </>
          )}
          {o.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => setDeliverOpen(true)}><Truck className="h-4 w-4" /> Giao hàng</Button>}
        </div>
      </div>
      {o.status === 'IN_PROGRESS' && o.serviceDeadline && (
        <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">Hạn hoàn thành còn <Countdown to={o.serviceDeadline} className="font-semibold" />. Quá hạn, người mua có quyền huỷ và nhận lại 100% tiền.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {o.deliveryType === 'AUTO' ? (
            <Card>
              <CardHeader title="Item đã giao" subtitle="Nội dung được che – chỉ người mua xem được bản đầy đủ" />
              <ul className="divide-y divide-border">
                {o.itemsMasked.map((it: any, i: number) => (
                  <li key={it.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                    <span className="w-6 text-xs text-muted">{i + 1}</span>
                    <code className="flex-1 font-mono text-xs">{it.preview}</code>
                    {it.status !== 'SOLD' && <Badge>Thu hồi/thay</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Yêu cầu của người mua" />
              <CardBody className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{o.buyerInput || o.snapshot?.requestBody || 'Không có'}</p>
                {o.deliveryNote && (
                  <div className="rounded-xl bg-success-soft p-3">
                    <p className="text-xs font-semibold text-success">Bạn đã giao</p>
                    <p className="whitespace-pre-wrap">{o.deliveryNote}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          {o.disputes.map((d: any) => (
            <Card key={d.id} className="border-warning/40">
              <CardHeader title={`Khiếu nại · ${d.reason}`} action={<StatusBadge map={DISPUTE_STATUS} value={d.status} />} />
              <CardBody className="text-sm">
                <p className="text-fg2">{d.description}</p>
                <Link href="/seller/khieu-nai" className="mt-2 inline-block text-primary hover:underline">Xử lý khiếu nại →</Link>
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="font-semibold">{o.title}</p>
            <p className="text-sm text-muted">{o.variantName} × {o.qty}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Tổng đơn</dt><dd className="tabular">{vnd(o.total)}</dd></div>
              {o.refundedAmount > 0 && <div className="flex justify-between text-danger"><dt>Đã hoàn người mua</dt><dd className="tabular">−{vnd(o.refundedAmount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Phí sàn ({o.feeBps / 100}%)</dt><dd className="tabular">−{vnd(o.total - o.refundedAmount - net)}</dd></div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Bạn nhận</dt><dd className="tabular text-success">{vnd(net)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Bảo hành</dt><dd>{hoursLabel(o.warrantyHours)}</dd></div>
              {o.escrow && <div className="flex justify-between"><dt className="text-muted">Ký quỹ</dt><dd>{o.escrow.status === 'HOLDING' && o.escrow.releaseAt ? <>giải ngân sau <Countdown to={o.escrow.releaseAt} /></> : o.escrow.status === 'RELEASED' ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Đã giải ngân</span> : o.escrow.status}</dd></div>}
            </dl>
          </Card>
          <Card className="p-4">
            <p className="mb-3 font-semibold">Dòng thời gian</p>
            <ol className="space-y-3 text-sm">
              {o.events.map((e: any, i: number) => (
                <li key={i}><p>{e.message}</p><p className="text-xs text-muted">{dateTime(e.createdAt)}</p></li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <Modal open={deliverOpen} onClose={() => setDeliverOpen(false)} title="Giao hàng cho người mua" footer={<><Button variant="ghost" onClick={() => setDeliverOpen(false)}>Huỷ</Button><Button loading={busy} disabled={note.trim().length < 5} onClick={() => run(() => api(`/seller/orders/${code}/deliver`, { body: { note, uploadIds: files.map((f) => f.id) } }), 'Đã giao hàng – chờ người mua xác nhận')}>Xác nhận đã giao</Button></>}>
        <div className="space-y-3">
          <Field label="Nội dung bàn giao" hint="Link file, thông tin đăng nhập, mô tả công việc đã làm…">{(id) => <Textarea id={id} rows={5} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />}</Field>
          <div><p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh bằng chứng (riêng tư)</p><ImageUpload purpose="delivery" value={files} onChange={setFiles} max={10} label="Ảnh" /></div>
        </div>
      </Modal>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Từ chối đơn" size="sm" footer={<><Button variant="ghost" onClick={() => setRejectOpen(false)}>Huỷ</Button><Button variant="danger" loading={busy} disabled={note.trim().length < 5} onClick={() => run(() => api(`/seller/orders/${code}/reject`, { body: { reason: note } }), 'Đã từ chối – tiền đã hoàn cho người mua')}>Từ chối & hoàn tiền</Button></>}>
        <Field label="Lý do">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}</Field>
      </Modal>
    </div>
  );
}
