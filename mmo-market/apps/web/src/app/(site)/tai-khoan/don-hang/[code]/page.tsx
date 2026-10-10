'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Countdown, CopyButton, DISPUTE_STATUS, EmptyState, Field, Modal, ORDER_STATUS, RESOLUTION, Select, Skeleton, StarInput, StatusBadge, Textarea, cn, dateTime, hoursLabel, timeAgo, useToast, vnd } from '@mmo/ui';
import { AlertTriangle, CheckCircle2, Download, Eye, Lock, MessageCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, errMsg } from '@/lib/api';

function DisputeThread({ d, onChange }: { d: any; onChange: () => void }) {
  const [msg, setMsg] = useState('');
  const [files, setFiles] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setMsg('');
      setFiles([]);
      onChange();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const open = d.status !== 'RESOLVED';
  const canEscalate = d.status === 'SELLER_RESPONDED' || (d.status === 'OPEN' && new Date(d.sellerDeadline) < new Date());
  const roleLabel: Record<string, string> = { BUYER: 'Bạn', SELLER: 'Người bán', ADMIN: 'Admin', SYSTEM: 'Hệ thống' };
  return (
    <Card className={cn(open && 'border-warning/50')}>
      <CardHeader
        title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Khiếu nại · {d.reason === 'LOGIN_FAILED' ? 'Không đăng nhập được' : d.reason}</span>}
        subtitle={`Mở ${timeAgo(d.createdAt)}`}
        action={<StatusBadge map={DISPUTE_STATUS} value={d.status} />}
      />
      <CardBody className="space-y-4">
        {d.status === 'OPEN' && (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            Người bán còn <Countdown to={d.sellerDeadline} className="font-semibold" /> để phản hồi. Quá hạn, hệ thống sẽ tự hoàn tiền cho bạn.
          </p>
        )}
        {d.status === 'SELLER_RESPONDED' && (
          <div className="rounded-lg bg-info-soft p-3 text-sm text-info">
            Người bán đã {d.sellerAction === 'REPLACE' ? 'đổi item mới (xem lại phần nhận hàng)' : 'từ chối khiếu nại'}: “{d.sellerMessage}”. Bạn có <Countdown to={d.buyerDeadline} className="font-semibold" /> để chấp nhận hoặc yêu cầu admin phân xử.
          </div>
        )}
        {d.status === 'RESOLVED' && (
          <p className="rounded-lg bg-success-soft p-3 text-sm text-success">
            Kết quả: <b>{RESOLUTION[d.resolution] ?? d.resolution}</b>
            {d.refundAmount > 0 && <> · Đã hoàn {vnd(d.refundAmount)} vào ví</>}
            {d.resolutionNote && <> · {d.resolutionNote}</>}
          </p>
        )}
        <ol className="space-y-3">
          {d.events.map((e: any, i: number) => (
            <li key={i} className={cn('flex gap-3', e.actorRole === 'BUYER' && 'flex-row-reverse text-right')}>
              <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-sm', e.actorRole === 'BUYER' ? 'bg-primary-soft' : e.actorRole === 'ADMIN' ? 'bg-warning-soft' : 'bg-subtle')}>
                <p className="text-[11px] font-semibold text-muted">{roleLabel[e.actorRole] ?? e.actorRole} · {timeAgo(e.createdAt)}</p>
                {e.message && <p className="whitespace-pre-wrap text-fg">{e.message}</p>}
                {e.attachments?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.attachments.map((u: string) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Bằng chứng" className="h-16 w-16 rounded-md object-cover" /></a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {open && (
          <div className="space-y-2 border-t border-border pt-4">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Gửi thêm thông tin / bằng chứng cho người bán và admin…" maxLength={2000} />
            <ImageUpload purpose="dispute" value={files} onChange={setFiles} max={5} label="Ảnh" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!msg.trim()} loading={busy} onClick={() => act(() => api(`/disputes/${d.id}/messages`, { body: { message: msg, attachmentIds: files.map((f) => f.id) } }), 'Đã gửi')}>
                <MessageCircle className="h-4 w-4" /> Gửi tin
              </Button>
              {d.status !== 'ESCALATED' && (
                <Button size="sm" variant="success" loading={busy} onClick={() => act(() => api(`/disputes/${d.id}/accept`, { method: 'POST' }), d.status === 'OPEN' ? 'Đã rút khiếu nại' : 'Đã chấp nhận phản hồi')}>
                  <CheckCircle2 className="h-4 w-4" /> {d.status === 'OPEN' ? 'Rút khiếu nại' : 'Chấp nhận'}
                </Button>
              )}
              {canEscalate && (
                <Button size="sm" variant="danger" loading={busy} disabled={msg.trim().length < 5} onClick={() => act(() => api(`/disputes/${d.id}/escalate`, { body: { message: msg } }), 'Đã chuyển admin phân xử')} title="Nhập lý do vào ô tin nhắn trước">
                  Yêu cầu admin phân xử
                </Button>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function OrderDetailPage() {
  const { code } = useParams<{ code: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { data: o, isLoading, refetch } = useQuery({ queryKey: ['order', code], queryFn: () => api<any>(`/orders/${code}`) });
  const [items, setItems] = useState<{ id: string; status: string; content: string }[] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState('LOGIN_FAILED');
  const [desc, setDesc] = useState('');
  const [proof, setProof] = useState<UploadedImage[]>([]);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: reasons } = useQuery({ queryKey: ['dispute-reasons'], queryFn: () => api<{ value: string; label: string }[]>('/orders/dispute-reasons'), enabled: disputeOpen });

  const reload = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['wallet'] });
    if (items) reveal();
  };
  const reveal = async () => {
    setRevealing(true);
    try {
      const r = await api<{ items: any[] }>(`/orders/${code}/items`);
      setItems(r.items);
    } catch (e) {
      toast.error('Không tải được hàng', errMsg(e));
    } finally {
      setRevealing(false);
    }
  };
  const download = () => {
    if (!items) return;
    const blob = new Blob([items.filter((i) => i.status === 'SOLD').map((i) => i.content).join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${code}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (!o) return <EmptyState title="Không tìm thấy đơn hàng" />;
  const openDispute = o.disputes.find((d: any) => d.status !== 'RESOLVED');
  const canDispute = o.status === 'DELIVERED' && o.escrow?.status === 'HOLDING' && o.escrow?.releaseAt && new Date(o.escrow.releaseAt) > new Date();
  const canCancel = o.deliveryType === 'MANUAL' && (o.status === 'PAID' || (o.status === 'IN_PROGRESS' && o.serviceDeadline && new Date(o.serviceDeadline) < new Date()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/tai-khoan/don-hang" className="text-xs text-muted hover:text-fg">← Đơn mua</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
            Đơn {o.code} <CopyButton text={o.code} label="" /> <StatusBadge map={ORDER_STATUS} value={o.status} />
          </h1>
          <p className="text-sm text-muted">Đặt lúc {dateTime(o.createdAt)} · <Link href={`/shop/${o.store.slug}`} className="text-primary hover:underline">{o.store.name}</Link></p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const c = await api<{ id: string }>('/chat/conversations', { body: { peerUserId: o.store.ownerId, context: { type: 'order', id: o.code } } });
            router.push(`/tai-khoan/tin-nhan?c=${c.id}`);
          }}
        >
          <MessageCircle className="h-4 w-4" /> Nhắn người bán
        </Button>
      </div>

      {o.status === 'DELIVERED' && o.escrow?.status === 'HOLDING' && (
        <Card className="flex flex-wrap items-center gap-4 border-primary/30 bg-primary-soft/40 p-4">
          <Lock className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-fg">Tiền {vnd(o.escrow.amount)} đang được sàn giữ</p>
            <p className="text-fg2">Tự động chuyển cho người bán sau <Countdown to={o.escrow.releaseAt} className="font-semibold text-primary" />. Kiểm tra hàng và báo lỗi trong thời gian này nếu có vấn đề.</p>
          </div>
          <div className="flex gap-2">
            {canDispute && !openDispute && (
              <Button variant="outline" onClick={() => setDisputeOpen(true)}>
                <AlertTriangle className="h-4 w-4" /> Báo lỗi
              </Button>
            )}
            <Button variant="success" loading={busy} onClick={() => confirm('Xác nhận đã nhận hàng và hài lòng? Tiền sẽ chuyển ngay cho người bán, bạn không thể khiếu nại sau đó.') && run(() => api(`/orders/${code}/confirm`, { method: 'POST' }), 'Đã xác nhận đơn hàng')}>
              <CheckCircle2 className="h-4 w-4" /> Đã nhận, hài lòng
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {o.deliveryType === 'AUTO' ? (
            <Card>
              <CardHeader
                title="Nhận hàng"
                subtitle={`${o.units} item · định dạng: ${o.snapshot?.stockFormat ?? 'theo mô tả'}`}
                action={
                  items ? (
                    <div className="flex gap-1">
                      <CopyButton text={items.filter((i) => i.status === 'SOLD').map((i) => i.content).join('\n')} label="Chép tất cả" />
                      <Button size="sm" variant="ghost" onClick={download}><Download className="h-4 w-4" /> .txt</Button>
                    </div>
                  ) : null
                }
              />
              <CardBody>
                {!items ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center">
                    <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-2 text-sm text-fg2">Dữ liệu hàng được mã hoá. Mỗi lần xem đều được ghi nhật ký để bảo vệ bạn.</p>
                    <Button className="mt-3" loading={revealing} onClick={reveal}><Eye className="h-4 w-4" /> Hiện hàng đã mua</Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {items.map((it, i) => (
                      <li key={it.id} className={cn('flex items-center gap-3 px-3 py-2', it.status !== 'SOLD' && 'opacity-50')}>
                        {canDispute && it.status === 'SOLD' && (
                          <input type="checkbox" className="accent-[var(--primary)]" checked={selected.includes(it.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, it.id] : selected.filter((x) => x !== it.id))} aria-label={`Chọn item ${i + 1}`} />
                        )}
                        <span className="w-6 text-xs text-muted tabular">{i + 1}</span>
                        <code className="min-w-0 flex-1 break-all text-[13px]">{it.content}</code>
                        {it.status === 'SOLD' ? <CopyButton text={it.content} label="" /> : <Badge>Đã thay/hoàn</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
                {items && canDispute && !openDispute && selected.length > 0 && (
                  <Button className="mt-3" variant="outline" onClick={() => setDisputeOpen(true)}>
                    <AlertTriangle className="h-4 w-4" /> Báo lỗi {selected.length} item đã chọn
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Thông tin dịch vụ" subtitle={o.serviceDeadline ? `Hạn hoàn thành: ${dateTime(o.serviceDeadline)}` : undefined} />
              <CardBody className="space-y-3 text-sm">
                {o.buyerInput && <div><p className="text-xs font-semibold text-muted">Yêu cầu bạn đã gửi</p><p className="whitespace-pre-wrap">{o.buyerInput}</p></div>}
                {o.snapshot?.offerMessage && <div><p className="text-xs font-semibold text-muted">Báo giá của người bán</p><p className="whitespace-pre-wrap">{o.snapshot.offerMessage}</p></div>}
                {o.deliveryNote ? (
                  <div className="rounded-xl bg-success-soft p-3">
                    <p className="text-xs font-semibold text-success">Người bán đã giao</p>
                    <p className="whitespace-pre-wrap text-fg">{o.deliveryNote}</p>
                    <div className="mt-2 flex gap-2">
                      {o.deliveryUploads.map((u: string) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted">{o.status === 'PAID' ? 'Đang chờ người bán nhận đơn.' : o.status === 'IN_PROGRESS' ? 'Người bán đang thực hiện.' : ''}</p>
                )}
                {canCancel && (
                  <Button variant="danger" size="sm" loading={busy} onClick={() => confirm('Huỷ đơn và hoàn tiền 100%?') && run(() => api(`/orders/${code}/cancel`, { method: 'POST' }), 'Đã huỷ đơn, tiền đã hoàn về ví')}>
                    Huỷ đơn & hoàn tiền
                  </Button>
                )}
              </CardBody>
            </Card>
          )}

          {o.disputes.map((d: any) => (
            <DisputeThread key={d.id} d={d} onChange={reload} />
          ))}

          {o.status === 'COMPLETED' && !o.review && (
            <Card>
              <CardHeader title="Đánh giá đơn hàng" subtitle="Đánh giá giúp người mua khác chọn gian hàng uy tín." />
              <CardBody className="space-y-3">
                <StarInput value={rating} onChange={setRating} />
                <Textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Chất lượng hàng, tốc độ giao, hỗ trợ của người bán…" maxLength={2000} />
                <Button loading={busy} disabled={review.trim().length < 5} onClick={() => run(() => api(`/orders/${code}/review`, { body: { rating, content: review } }), 'Cảm ơn bạn đã đánh giá!')}>Gửi đánh giá</Button>
              </CardBody>
            </Card>
          )}
          {o.review && (
            <Card className="p-4 text-sm">
              <p className="font-semibold">Đánh giá của bạn: {'★'.repeat(o.review.rating)}</p>
              <p className="mt-1 text-fg2">{o.review.content}</p>
              {o.review.sellerReply && <p className="mt-2 rounded-lg bg-subtle p-2"><b>Người bán:</b> {o.review.sellerReply}</p>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="font-semibold">{o.title}</p>
            <p className="text-sm text-muted">{o.variantName}</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Đơn giá</dt><dd className="tabular">{vnd(o.unitPrice)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Số lượng</dt><dd className="tabular">{o.qty}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Bảo hành</dt><dd>{hoursLabel(o.warrantyHours)}</dd></div>
              {o.refundedAmount > 0 && <div className="flex justify-between text-success"><dt>Đã hoàn</dt><dd className="tabular">−{vnd(o.refundedAmount)}</dd></div>}
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Tổng thanh toán</dt><dd className="tabular">{vnd(o.total)}</dd></div>
            </dl>
          </Card>
          <Card className="p-4">
            <p className="mb-3 font-semibold">Dòng thời gian</p>
            <ol className="relative space-y-4 border-l border-border pl-4">
              {o.events.map((e: any, i: number) => (
                <li key={i} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <p className="text-fg">{e.message}</p>
                  <p className="text-xs text-muted">{dateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Modal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title="Báo lỗi / khiếu nại"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>Huỷ</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={desc.trim().length < 10 || (o.deliveryType === 'AUTO' && selected.length === 0)}
              onClick={() =>
                run(async () => {
                  await api(`/orders/${code}/disputes`, { body: { reason, description: desc, stockItemIds: selected, attachmentIds: proof.map((p) => p.id) } });
                  setDisputeOpen(false);
                  setSelected([]);
                }, 'Đã gửi khiếu nại – tiền được đóng băng tới khi giải quyết')
              }
            >
              Gửi khiếu nại
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {o.deliveryType === 'AUTO' && (
            <p className={cn('rounded-lg p-2.5 text-sm', selected.length ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning')}>
              {selected.length ? `Đã chọn ${selected.length} item lỗi.` : 'Hãy bấm “Hiện hàng đã mua” rồi tick chọn các item bị lỗi.'}
            </p>
          )}
          <Field label="Lý do">
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons?.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Mô tả chi tiết" hint="Tối thiểu 10 ký tự">{(id) => <Textarea id={id} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={3000} />}</Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh bằng chứng (không bắt buộc)</p>
            <ImageUpload purpose="dispute" value={proof} onChange={setProof} max={5} label="Ảnh" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
