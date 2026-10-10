'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, Field, Input, Modal, StatusBadge, TD, TH, Table, Textarea, cn, dateTime, vnd } from '@mmo/ui';
import { Check, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Chips } from '@/components/Toolbar';
import { UserPicker, type PickedUser } from '@/components/UserPicker';
import { api } from '@/lib/api';
import { useCan, useStaff } from '@/lib/hooks';
import { ADJ_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

const TYPE: Record<string, string> = { MANUAL: 'Thủ công', DEPOSIT_MATCH: 'Khớp nạp NH', CLAIM: 'Báo chuyển nhầm' };

export function Adjustments() {
  const can = useCan();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState('PENDING');
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<PickedUser | null>(null);
  const [form, setForm] = useState({ direction: 'CREDIT', amount: '', reason: '' });
  const { data, refetch } = useQuery({ queryKey: ['adm-adjustments', status], queryFn: () => api<any[]>(`/admin/finance/adjustments?status=${status}`) });
  const after = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['queues'] });
  };
  const create = async () => {
    const ok = await run('create', () => api('/admin/finance/adjustments', { body: { userId: user!.id, direction: form.direction, amount: Number(form.amount.replace(/\D/g, '')), reason: form.reason, type: 'MANUAL' } }), 'Đã tạo yêu cầu – chờ người thứ hai duyệt');
    if (ok) {
      setOpen(false);
      setStatus('PENDING');
      after();
    }
  };
  const decide = (id: string, approve: boolean) => run(id, () => api(`/admin/finance/adjustments/${id}/decide`, { body: { approve } }), approve ? 'Đã duyệt & ghi sổ cái' : 'Đã từ chối').then((ok): unknown => ok && after());

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <Chips value={status} onChange={setStatus} items={Object.entries(ADJ_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <Button size="sm" variant="outline" onClick={() => { setUser(null); setForm({ direction: 'CREDIT', amount: '', reason: '' }); setOpen(true); }}><Plus className="h-4 w-4" /> Tạo điều chỉnh</Button>
      </div>
      <p className="mx-3 mb-3 rounded-lg bg-info-soft p-2.5 text-xs text-info">Nguyên tắc 4 mắt: người tạo yêu cầu không thể tự duyệt. Khi duyệt, hệ thống ghi bút toán kép vào sổ cái và thông báo cho người dùng.</p>
      {!data?.length ? (
        <EmptyState title="Không có yêu cầu" />
      ) : (
        <Table>
          <thead><tr><TH>Người dùng</TH><TH>Loại</TH><TH align="right">Số tiền</TH><TH>Lý do</TH><TH>Người tạo</TH><TH>Người duyệt</TH><TH>Trạng thái</TH><TH /></tr></thead>
          <tbody>
            {data.map((a) => {
              const mine = a.requestedById === me?.user?.id;
              return (
                <tr key={a.id}>
                  <TD><Link href={`/nguoi-dung/${a.userId}`} className="font-medium hover:text-primary">@{a.user?.username}</Link></TD>
                  <TD><Badge>{TYPE[a.type] ?? a.type}</Badge></TD>
                  <TD align="right" className={cn('whitespace-nowrap font-semibold', a.direction === 'CREDIT' ? 'text-success' : 'text-danger')}>{a.direction === 'CREDIT' ? '+' : '−'}{vnd(a.amount)}</TD>
                  <TD className="max-w-xs text-xs text-fg2">{a.reason}</TD>
                  <TD className="text-xs">{a.requestedBy?.displayName}<p className="text-muted">{dateTime(a.createdAt)}</p></TD>
                  <TD className="text-xs">{a.decidedBy ? <>{a.decidedBy.displayName}<p className="text-muted">{dateTime(a.decidedAt)}</p></> : '—'}</TD>
                  <TD><StatusBadge map={ADJ_STATUS} value={a.status} /></TD>
                  <TD align="right">
                    {a.status === 'PENDING' && can('adjustment.approve') && (
                      mine ? <span className="text-xs text-muted">Chờ người khác duyệt</span> : (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="success" loading={busy === a.id} onClick={() => confirm(`Duyệt ${a.direction === 'CREDIT' ? 'cộng' : 'trừ'} ${vnd(a.amount)} cho @${a.user?.username}?`) && decide(a.id, true)}><Check className="h-4 w-4" /> Duyệt</Button>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => decide(a.id, false)} aria-label="Từ chối"><X className="h-4 w-4" /></Button>
                        </div>
                      )
                    )}
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Tạo yêu cầu điều chỉnh số dư" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button><Button loading={busy === 'create'} disabled={!user || !Number(form.amount.replace(/\D/g, '')) || form.reason.trim().length < 10} onClick={create}>Gửi yêu cầu</Button></>}>
        <div className="space-y-3">
          <Field label="Người dùng">{() => <UserPicker value={user} onChange={setUser} />}</Field>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'CREDIT', l: 'Cộng tiền' }, { v: 'DEBIT', l: 'Trừ tiền' }].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm({ ...form, direction: o.v })} className={cn('rounded-lg border p-2 text-sm font-medium', form.direction === o.v ? (o.v === 'CREDIT' ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger') : 'border-border')}>{o.l}</button>
            ))}
          </div>
          <Field label="Số tiền">{(id) => <Input id={id} inputMode="numeric" value={form.amount ? Number(form.amount.replace(/\D/g, '')).toLocaleString('vi-VN') : ''} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Lý do chi tiết" hint="Tối thiểu 10 ký tự. Người dùng sẽ thấy nội dung này trong thông báo.">{(id) => <Textarea id={id} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} />}</Field>
        </div>
      </Modal>
    </div>
  );
}
