'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CardBody, DEPOSIT_STATUS, EmptyState, Field, Modal, Pagination, StatusBadge, TD, TH, Table, Textarea, dateTime, vnd } from '@mmo/ui';
import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { Chips, SearchInput } from '@/components/Toolbar';
import { UserPicker, type PickedUser } from '@/components/UserPicker';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

export function Deposits() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(status && { status }), ...(q && { q }) });
  const { data } = useQuery({ queryKey: ['adm-deposits', params.toString()], queryFn: () => api<any>(`/admin/finance/deposits?${params}`), placeholderData: keepPreviousData });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Mã nạp NAP…" className="w-56" />
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: '', label: 'Tất cả' }, ...Object.entries(DEPOSIT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
      </div>
      {!data?.items.length ? (
        <EmptyState title="Không có lệnh nạp" />
      ) : (
        <Table>
          <thead><tr><TH>Mã nạp</TH><TH>Người dùng</TH><TH align="right">Yêu cầu</TH><TH align="right">Thực nhận</TH><TH>Cổng</TH><TH>Trạng thái</TH><TH>Tạo lúc</TH><TH>Hoàn tất</TH></tr></thead>
          <tbody>
            {data.items.map((d: any) => (
              <tr key={d.id}>
                <TD className="font-mono text-xs">{d.code}</TD>
                <TD><Link href={`/nguoi-dung/${d.userId}`} className="hover:text-primary">@{d.user?.username}</Link></TD>
                <TD align="right" className="whitespace-nowrap">{vnd(d.amountExpected)}</TD>
                <TD align="right" className="whitespace-nowrap font-semibold">{d.amountReceived != null ? vnd(d.amountReceived) : '—'}</TD>
                <TD className="text-xs text-muted">{d.provider}{d.providerTxnId && <p className="max-w-[140px] truncate font-mono">{d.providerTxnId}</p>}</TD>
                <TD><StatusBadge map={DEPOSIT_STATUS} value={d.status} /></TD>
                <TD className="whitespace-nowrap text-xs text-muted">{dateTime(d.createdAt)}</TD>
                <TD className="whitespace-nowrap text-xs text-muted">{d.completedAt ? dateTime(d.completedAt) : '—'}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}

export function BankEvents() {
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState('UNMATCHED');
  const [page, setPage] = useState(1);
  const [match, setMatch] = useState<any>(null);
  const [user, setUser] = useState<PickedUser | null>(null);
  const [reason, setReason] = useState('');
  const { data, refetch } = useQuery({ queryKey: ['adm-bank-events', status, page], queryFn: () => api<any>(`/admin/finance/bank-events?status=${status}&page=${page}`), placeholderData: keepPreviousData });
  const submit = async () => {
    const ok = await run('match', () => api('/admin/finance/adjustments', { body: { userId: user!.id, direction: 'CREDIT', amount: Number(match.amount), reason, type: 'DEPOSIT_MATCH', refId: match.id } }), 'Đã tạo yêu cầu khớp – cần nhân sự thứ hai duyệt ở tab Điều chỉnh số dư');
    if (ok) {
      setMatch(null);
      refetch();
      qc.invalidateQueries({ queryKey: ['queues'] });
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: 'UNMATCHED', label: 'Chưa khớp' }, { value: 'MATCHED_MANUAL', label: 'Đã khớp tay' }, { value: 'PROCESSED', label: 'Tự động khớp' }, { value: 'IGNORED', label: 'Bỏ qua' }]} />
        <p className="text-xs text-muted">Tiền vào tài khoản sàn nhưng nội dung CK không khớp mã nạp nào.</p>
      </div>
      {!data?.items.length ? (
        <EmptyState title="Không có giao dịch" />
      ) : (
        <Table>
          <thead><tr><TH>Thời gian</TH><TH>Cổng / mã GD</TH><TH>Nội dung chuyển khoản</TH><TH align="right">Số tiền</TH><TH /></tr></thead>
          <tbody>
            {data.items.map((e: any) => (
              <tr key={e.id}>
                <TD className="whitespace-nowrap text-xs text-muted">{dateTime(e.createdAt)}</TD>
                <TD className="text-xs">{e.provider}<p className="font-mono text-muted">{e.providerTxnId}</p></TD>
                <TD className="max-w-xs font-mono text-xs">{e.content}</TD>
                <TD align="right" className="whitespace-nowrap font-semibold">{vnd(e.amount)}</TD>
                <TD align="right">{e.status === 'UNMATCHED' && <Button size="sm" variant="outline" onClick={() => { setMatch(e); setUser(null); setReason(''); }}><Link2 className="h-4 w-4" /> Khớp</Button>}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      <Modal open={!!match} onClose={() => setMatch(null)} title={`Khớp giao dịch ${match ? vnd(match.amount) : ''}`} footer={<><Button variant="ghost" onClick={() => setMatch(null)}>Huỷ</Button><Button loading={busy === 'match'} disabled={!user || reason.trim().length < 10} onClick={submit}>Tạo yêu cầu cộng tiền</Button></>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-subtle p-2.5 font-mono text-xs">{match?.content}</p>
          <Field label="Cộng vào ví của">{() => <UserPicker value={user} onChange={setUser} />}</Field>
          <Field label="Căn cứ đối chiếu" hint="Tối thiểu 10 ký tự, vd: khách gửi biên lai qua chat hỗ trợ #…">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}</Field>
        </div>
      </Modal>
    </div>
  );
}

export function Claims() {
  const qc = useQueryClient();
  const { run } = useRun();
  const [status, setStatus] = useState('PENDING');
  const [reject, setReject] = useState<any>(null);
  const [approve, setApprove] = useState<any>(null);
  const { data, refetch } = useQuery({ queryKey: ['adm-claims', status], queryFn: () => api<any[]>(`/admin/finance/claims?status=${status}`) });
  const after = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['queues'] });
  };
  return (
    <div>
      <div className="p-3">
        <Chips value={status} onChange={setStatus} items={[{ value: 'PENDING', label: 'Chờ đối soát' }, { value: 'APPROVED', label: 'Đã cộng' }, { value: 'REJECTED', label: 'Từ chối' }]} />
      </div>
      {!data?.length ? (
        <EmptyState title="Không có yêu cầu" />
      ) : (
        <CardBody className="grid gap-3 pt-0 md:grid-cols-2">
          {data.map((c) => (
            <div key={c.id} className="flex gap-3 rounded-xl border border-border p-3">
              {c.receiptUrl ? (
                <a href={c.receiptUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.receiptUrl} alt="Biên lai" className="h-24 w-20 rounded-lg object-cover" />
                </a>
              ) : (
                <div className="grid h-24 w-20 shrink-0 place-items-center rounded-lg bg-subtle text-[10px] text-muted">Không ảnh</div>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{vnd(c.amount)}</p>
                <p className="text-xs text-muted">@{c.user?.username} · chuyển lúc {dateTime(c.transferAt)}</p>
                {c.note && <p className="mt-1 line-clamp-2 text-xs text-fg2">{c.note}</p>}
                {c.handleNote && <p className="mt-1 text-xs text-muted">Phản hồi: {c.handleNote}</p>}
                {c.status === 'PENDING' && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => setApprove(c)}>Tạo yêu cầu cộng</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setReject(c)}>Từ chối</Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardBody>
      )}
      <ReasonModal open={!!reject} onClose={() => setReject(null)} title="Từ chối yêu cầu" label="Lý do (gửi cho người dùng)" danger onSubmit={async (note) => { if (await run('rj', () => api(`/admin/finance/claims/${reject.id}/reject`, { body: { note } }), 'Đã từ chối')) { setReject(null); after(); } }} />
      <ReasonModal
        open={!!approve}
        onClose={() => setApprove(null)}
        title={`Cộng ${approve ? vnd(approve.amount) : ''} cho @${approve?.user?.username ?? ''}`}
        label="Căn cứ đối chiếu sao kê"
        min={10}
        onSubmit={async (reason) => {
          if (await run('ap', () => api('/admin/finance/adjustments', { body: { userId: approve.userId, direction: 'CREDIT', amount: Number(approve.amount), reason, type: 'CLAIM', refId: approve.id } }), 'Đã tạo yêu cầu – cần nhân sự thứ hai duyệt')) {
            setApprove(null);
            after();
          }
        }}
      >
        <p className="rounded-lg bg-info-soft p-2.5 text-xs text-info">Yêu cầu sẽ chuyển sang tab Điều chỉnh số dư và chỉ có hiệu lực khi một kế toán khác duyệt.</p>
      </ReasonModal>
    </div>
  );
}
