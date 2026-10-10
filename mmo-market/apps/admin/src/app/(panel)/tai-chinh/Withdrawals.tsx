'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, CopyButton, EmptyState, Field, Input, LevelBadge, Modal, Pagination, StatusBadge, TD, TH, Table, WITHDRAWAL_STATUS, dateTime, vnd } from '@mmo/ui';
import { Banknote, CheckCircle2, Eye, PauseCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { Chips } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { useCan, useStaff } from '@/lib/hooks';
import { useRun } from '@/lib/useRun';

const FLAG: Record<string, string> = { large_amount: 'Số tiền lớn (4 mắt)', risk_user: 'Tài khoản gắn cờ', no_recent_sales: 'Không có đơn 30 ngày' };

export function Withdrawals({ initialStatus }: { initialStatus: string }) {
  const can = useCan();
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState<{ code: string; action: 'hold' | 'reject' } | null>(null);
  const [pay, setPay] = useState<{ w: any; acct: any } | null>(null);
  const [bankRef, setBankRef] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['adm-withdrawals', status, page], queryFn: () => api<any>(`/admin/finance/withdrawals?page=${page}${status ? `&status=${status}` : ''}`), placeholderData: keepPreviousData });
  const done = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['queues'] });
  };
  const openPay = async (w: any) => {
    await run('reveal' + w.code, async () => {
      const acct = await api<any>(`/admin/finance/withdrawals/${w.code}/reveal`, { method: 'POST' });
      setBankRef('');
      setPay({ w, acct });
    });
  };

  return (
    <div>
      <div className="p-3">
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: 'REQUESTED', label: 'Chờ duyệt' }, { value: 'ON_HOLD', label: 'Đang giữ' }, { value: 'APPROVED', label: 'Chờ chuyển tiền' }, { value: 'PAID', label: 'Đã chuyển' }, { value: 'REJECTED', label: 'Từ chối' }, { value: 'CANCELLED', label: 'Đã huỷ' }, { value: '', label: 'Tất cả' }]} />
      </div>
      {!data?.items.length ? (
        <EmptyState title="Không có lệnh rút" />
      ) : (
        <Table>
          <thead><tr><TH>Mã</TH><TH>Người bán</TH><TH align="right">Số tiền</TH><TH>Ngân hàng</TH><TH>Cảnh báo</TH><TH>Trạng thái</TH><TH>Tạo lúc</TH><TH /></tr></thead>
          <tbody>
            {data.items.map((w: any) => (
              <tr key={w.code}>
                <TD className="font-mono text-xs">{w.code}</TD>
                <TD><Link href={`/nguoi-dung/${w.userId}`} className="font-medium hover:text-primary">@{w.user?.username}</Link>{w.user?.store && <p className="flex items-center gap-1 text-xs text-muted">{w.user.store.name} <LevelBadge level={w.user.store.level} /></p>}</TD>
                <TD align="right" className="whitespace-nowrap font-semibold">{vnd(w.amount)}</TD>
                <TD className="text-xs">{w.bank ? <>{w.bank.bankName}<br /><span className="text-muted">****{w.bank.accountLast4} · {w.bank.holderName}</span></> : '—'}</TD>
                <TD>
                  <div className="flex max-w-[200px] flex-wrap gap-1">{w.flags.map((f: string) => <Badge key={f} tone={f === 'large_amount' ? 'warning' : 'danger'}>{FLAG[f] ?? f}</Badge>)}</div>
                  {w.holdReason && <p className="mt-1 text-xs text-muted">{w.holdReason}</p>}
                </TD>
                <TD><StatusBadge map={WITHDRAWAL_STATUS} value={w.status} />{w.bankRef && <p className="text-xs text-muted">{w.bankRef}</p>}{w.rejectReason && <p className="text-xs text-danger">{w.rejectReason}</p>}</TD>
                <TD className="whitespace-nowrap text-xs text-muted">{dateTime(w.createdAt)}</TD>
                <TD align="right">
                  <div className="flex justify-end gap-1.5">
                    {can('withdrawal.approve') && ['REQUESTED', 'ON_HOLD'].includes(w.status) && (
                      <Button size="sm" variant="success" loading={busy === 'ap' + w.code} onClick={() => run('ap' + w.code, () => api(`/admin/finance/withdrawals/${w.code}/approve`, { method: 'POST' }), 'Đã duyệt lệnh rút').then((ok): unknown => ok && done())}><CheckCircle2 className="h-4 w-4" /> Duyệt</Button>
                    )}
                    {can('withdrawal.approve') && w.status === 'REQUESTED' && <Button size="sm" variant="outline" onClick={() => setReason({ code: w.code, action: 'hold' })} title="Giữ lại kiểm tra"><PauseCircle className="h-4 w-4" /></Button>}
                    {can('withdrawal.approve') && ['REQUESTED', 'ON_HOLD', 'APPROVED'].includes(w.status) && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setReason({ code: w.code, action: 'reject' })} title="Từ chối & hoàn tiền về ví"><XCircle className="h-4 w-4" /></Button>}
                    {can('withdrawal.pay') && w.status === 'APPROVED' && (
                      <Button size="sm" loading={busy === 'reveal' + w.code} disabled={Number(w.amount) >= 50_000_000 && w.approvedById === me?.user?.id} title={Number(w.amount) >= 50_000_000 && w.approvedById === me?.user?.id ? 'Lệnh lớn: người chuyển phải khác người duyệt' : undefined} onClick={() => openPay(w)}>
                        <Banknote className="h-4 w-4" /> Chuyển tiền
                      </Button>
                    )}
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}

      <ReasonModal
        open={!!reason}
        onClose={() => setReason(null)}
        title={reason?.action === 'hold' ? `Giữ lại lệnh ${reason?.code}` : `Từ chối lệnh ${reason?.code}`}
        label={reason?.action === 'reject' ? 'Lý do (gửi cho người bán, tiền hoàn về ví)' : 'Lý do giữ lại'}
        danger={reason?.action === 'reject'}
        onSubmit={async (r) => {
          const ok = await run('r', () => api(`/admin/finance/withdrawals/${reason!.code}/${reason!.action}`, { body: { reason: r } }), reason!.action === 'hold' ? 'Đã giữ lại' : 'Đã từ chối & hoàn tiền');
          if (ok) {
            setReason(null);
            done();
          }
        }}
      />

      <Modal open={!!pay} onClose={() => setPay(null)} title={`Chuyển tiền lệnh ${pay?.w.code ?? ''}`} footer={<><Button variant="ghost" onClick={() => setPay(null)}>Đóng</Button><Button loading={busy === 'paid'} disabled={bankRef.trim().length < 3} onClick={() => run('paid', () => api(`/admin/finance/withdrawals/${pay!.w.code}/mark-paid`, { body: { bankRef } }), 'Đã ghi nhận chuyển tiền').then((ok): unknown => ok && (setPay(null), done()))}>Đã chuyển xong</Button></>}>
        {pay && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-2.5 text-xs text-warning"><Eye className="h-4 w-4 shrink-0" /> Số tài khoản đầy đủ chỉ hiện ở đây và việc xem đã được ghi nhật ký.</p>
            <dl className="divide-y divide-border rounded-xl border border-border">
              {[
                ['Ngân hàng', pay.acct.bankName],
                ['Số tài khoản', pay.acct.accountNumber],
                ['Chủ tài khoản', pay.acct.holderName],
                ['Số tiền', String(pay.acct.amount)],
                ['Nội dung CK', pay.acct.transferContent],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="flex items-center gap-2 font-medium">{k === 'Số tiền' ? vnd(Number(v)) : v} <CopyButton text={v} label="" /></dd>
                </div>
              ))}
            </dl>
            <Field label="Mã giao dịch ngân hàng (FT…)" hint="Nhập sau khi đã chuyển khoản thành công trên internet banking">{(id) => <Input id={id} value={bankRef} onChange={(e) => setBankRef(e.target.value.toUpperCase())} />}</Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
