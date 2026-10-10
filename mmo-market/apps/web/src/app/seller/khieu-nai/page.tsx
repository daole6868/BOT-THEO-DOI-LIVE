'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Countdown, DISPUTE_STATUS, EmptyState, Field, Input, Modal, PageHeader, RESOLUTION, StatusBadge, Tabs, Textarea, cn, dateTime, useToast, vnd } from '@mmo/ui';
import { AlertTriangle, RefreshCw, Undo2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';

type Action = 'REPLACE' | 'REFUND' | 'REJECT';

export default function SellerDisputesPage() {
  const [status, setStatus] = useState('OPEN');
  const { data } = useQuery({ queryKey: ['seller-disputes', status], queryFn: () => api<any[]>(`/seller/disputes${status ? `?status=${status}` : ''}`) });
  const [target, setTarget] = useState<any>(null);
  const [action, setAction] = useState<Action>('REFUND');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const open = (d: any, a: Action) => {
    setTarget(d);
    setAction(a);
    setAmount(String(d.proposedRefund ?? d.order.total));
    setMessage('');
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/seller/disputes/${target.id}/respond`, { body: { action, message, amount: action === 'REFUND' ? Number(amount.replace(/\D/g, '')) : undefined } });
      toast.success(action === 'REJECT' ? 'Đã gửi phản hồi – chờ người mua' : 'Đã xử lý khiếu nại');
      setTarget(null);
      qc.invalidateQueries({ queryKey: ['seller-disputes'] });
      qc.invalidateQueries({ queryKey: ['seller-counts'] });
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Khiếu nại" subtitle="Phản hồi trước hạn để tránh bị tự động hoàn tiền cho người mua. Tỷ lệ khiếu nại ảnh hưởng tới cấp gian hàng." />
      <Card>
        <Tabs value={status} onChange={setStatus} className="px-3" items={[{ value: 'OPEN', label: 'Chờ bạn xử lý' }, { value: 'SELLER_RESPONDED', label: 'Đã phản hồi' }, { value: 'ESCALATED', label: 'Admin đang xử lý' }, { value: 'RESOLVED', label: 'Đã đóng' }, { value: '', label: 'Tất cả' }]} />
        {!data?.length ? (
          <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Không có khiếu nại" description="Tuyệt vời! Hãy tiếp tục giữ chất lượng hàng hoá." />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((d) => (
              <li key={d.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge map={DISPUTE_STATUS} value={d.status} />
                    <span className="font-semibold">{d.reasonLabel}</span>
                    <Link href={`/seller/don-hang/${d.order.code}`} className="font-mono text-xs text-primary">{d.order.code}</Link>
                  </div>
                  <p className="mt-1 text-sm text-fg2">{d.order.title} · {vnd(d.order.total)} · {d.order.buyer.displayName}</p>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-subtle p-3 text-sm">{d.description}</p>
                  {d.proposedRefund != null && <p className="mt-1 text-xs text-muted">Người mua đề xuất hoàn {vnd(d.proposedRefund)}</p>}
                  {d.sellerMessage && <p className="mt-2 text-sm"><span className="text-muted">Bạn đã trả lời:</span> {d.sellerMessage}</p>}
                  {d.resolution && <p className="mt-2 text-sm font-medium">Kết quả: {RESOLUTION[d.resolution] ?? d.resolution}{d.refundAmount > 0 && ` · hoàn ${vnd(d.refundAmount)}`}</p>}
                  <p className="mt-2 text-xs text-muted">Mở lúc {dateTime(d.createdAt)}</p>
                </div>
                {d.status === 'OPEN' && (
                  <div className="flex flex-col items-stretch gap-2 md:w-52">
                    <p className="rounded-lg bg-warning-soft px-3 py-2 text-center text-xs text-warning">Còn <Countdown to={d.sellerDeadline} className="font-semibold" /></p>
                    {d.order.deliveryType === 'AUTO' && <Button size="sm" variant="outline" onClick={() => open(d, 'REPLACE')}><RefreshCw className="h-4 w-4" /> Đổi item mới</Button>}
                    <Button size="sm" variant="outline" onClick={() => open(d, 'REFUND')}><Undo2 className="h-4 w-4" /> Hoàn tiền</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => open(d, 'REJECT')}><XCircle className="h-4 w-4" /> Từ chối kèm bằng chứng</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={action === 'REPLACE' ? 'Đổi item mới cho người mua' : action === 'REFUND' ? 'Hoàn tiền cho người mua' : 'Từ chối khiếu nại'}
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>Huỷ</Button><Button variant={action === 'REJECT' ? 'danger' : 'primary'} loading={busy} disabled={message.trim().length < 5} onClick={submit}>Xác nhận</Button></>}
      >
        {target && (
          <div className="space-y-3">
            {action === 'REPLACE' && <p className="rounded-lg bg-info-soft p-2.5 text-xs text-info">Hệ thống lấy {target.stockItemIds?.length || 'các'} item mới từ kho, thu hồi item cũ và giao lại ngay cho người mua.</p>}
            {action === 'REJECT' && <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">Người mua có thể đồng ý hoặc chuyển khiếu nại lên admin. Hãy giải thích rõ và gửi bằng chứng qua tin nhắn.</p>}
            {action === 'REFUND' && (
              <Field label="Số tiền hoàn" hint={`Tối đa ${vnd(target.order.total)}. Hoàn một phần nếu chỉ lỗi một số item.`}>
                {(id) => <Input id={id} inputMode="numeric" value={amount ? Number(amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />}
              </Field>
            )}
            <Field label="Lời nhắn cho người mua">{(id) => <Textarea id={id} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} className={cn(message && message.trim().length < 5 && 'border-danger')} />}</Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
