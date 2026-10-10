'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, DEPOSIT_STATUS, EmptyState, Field, Input, Modal, PageHeader, Pagination, StatCard, StatusBadge, TD, TH, TXN_TYPES, Table, Tabs, Textarea, cn, dateTime, vnd, useToast } from '@mmo/ui';
import { ArrowDownLeft, ArrowUpRight, Clock, Plus, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DepositModal } from '@/components/DepositModal';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, errMsg } from '@/lib/api';
import { useMe, useWallet } from '@/lib/hooks';

export default function WalletPage() {
  const { data: me } = useMe();
  const { data: w } = useWallet();
  const [tab, setTab] = useState<'txns' | 'deposits' | 'claims'>('txns');
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [depOpen, setDepOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claim, setClaim] = useState({ amount: '', transferAt: '', note: '' });
  const [receipt, setReceipt] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const txns = useQuery({ queryKey: ['txns', page, type], queryFn: () => api<any>(`/wallet/transactions?page=${page}${type ? `&type=${type}` : ''}`), enabled: tab === 'txns' });
  const deps = useQuery({ queryKey: ['deposits', page], queryFn: () => api<any>(`/wallet/deposits?page=${page}`), enabled: tab === 'deposits' });
  const claims = useQuery({ queryKey: ['claims'], queryFn: () => api<any[]>('/wallet/deposit-claims'), enabled: tab === 'claims' });

  const submitClaim = async () => {
    setBusy(true);
    try {
      await api('/wallet/deposit-claims', { body: { amount: Number(claim.amount.replace(/\D/g, '')), transferAt: new Date(claim.transferAt).toISOString(), note: claim.note || undefined, receiptUploadId: receipt[0]?.id } });
      toast.success('Đã gửi yêu cầu', 'Kế toán sẽ đối soát và cộng tiền nếu khớp.');
      setClaimOpen(false);
      setClaim({ amount: '', transferAt: '', note: '' });
      setReceipt([]);
      qc.invalidateQueries({ queryKey: ['claims'] });
      setTab('claims');
    } catch (e) {
      toast.error('Không gửi được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Ví của tôi"
        subtitle="Số dư dùng để mua hàng trên sàn. Tiền mua hàng luôn đi qua ký quỹ."
        actions={
          <>
            <Button variant="outline" onClick={() => setClaimOpen(true)}>Chuyển nhầm nội dung?</Button>
            <Button onClick={() => setDepOpen(true)}><Plus className="h-4 w-4" /> Nạp tiền</Button>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Số dư khả dụng" value={w ? vnd(w.available) : '…'} icon={<Wallet className="h-4 w-4" />} hint="Dùng để mua hàng ngay" />
        {me?.user?.store ? (
          <>
            <StatCard label="Tiền bán hàng đang giữ (escrow)" value={w ? vnd(w.incomingEscrow) : '…'} icon={<Clock className="h-4 w-4" />} hint="Giải ngân khi hết bảo hành" href="/seller/tai-chinh" />
            <StatCard label="Đang chờ rút" value={w ? vnd(w.pendingWithdrawal) : '…'} icon={<ArrowUpRight className="h-4 w-4" />} hint="Lệnh rút đang xử lý" href="/seller/tai-chinh" />
          </>
        ) : (
          <Card className="flex items-center gap-3 p-4 text-sm text-fg2 sm:col-span-2">
            Muốn bán hàng và rút tiền về ngân hàng? <Link href="/tai-khoan/dang-ky-ban-hang" className="font-medium text-primary hover:underline">Đăng ký gian hàng →</Link>
          </Card>
        )}
      </div>
      <Card>
        <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} className="px-3" items={[{ value: 'txns', label: 'Biến động số dư' }, { value: 'deposits', label: 'Lịch sử nạp' }, { value: 'claims', label: 'Yêu cầu đối soát' }]} />
        {tab === 'txns' && (
          <>
            <div className="flex gap-2 px-4 pt-3">
              {['', 'deposit', 'purchase', 'refund', 'escrow_release'].map((t) => (
                <button key={t} type="button" onClick={() => { setType(t); setPage(1); }} className={cn('rounded-full border px-3 py-1 text-xs', type === t ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg2')}>
                  {t ? TXN_TYPES[t] : 'Tất cả'}
                </button>
              ))}
            </div>
            {!txns.data?.items.length ? (
              <EmptyState title="Chưa có giao dịch" />
            ) : (
              <Table className="mt-2">
                <thead><tr><TH>Thời gian</TH><TH>Loại</TH><TH>Nội dung</TH><TH align="right">Số tiền</TH><TH align="right">Số dư sau</TH></tr></thead>
                <tbody>
                  {txns.data.items.map((t: any) => (
                    <tr key={t.id} className="hover:bg-subtle/50">
                      <TD className="whitespace-nowrap text-muted">{dateTime(t.createdAt)}</TD>
                      <TD><span className="inline-flex items-center gap-1.5">{t.amount > 0 ? <ArrowDownLeft className="h-4 w-4 text-success" /> : <ArrowUpRight className="h-4 w-4 text-danger" />}{TXN_TYPES[t.type] ?? t.type}</span></TD>
                      <TD className="max-w-xs truncate text-fg2">{t.description}</TD>
                      <TD align="right" className={cn('font-semibold', t.amount > 0 ? 'text-success' : 'text-fg')}>{t.amount > 0 ? '+' : ''}{vnd(t.amount)}</TD>
                      <TD align="right" className="text-muted">{vnd(t.balanceAfter)}</TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {txns.data && <Pagination page={txns.data.page} pageSize={txns.data.pageSize} total={txns.data.total} onChange={setPage} />}
          </>
        )}
        {tab === 'deposits' && (
          <>
            {!deps.data?.items.length ? (
              <EmptyState title="Chưa nạp lần nào" action={<Button onClick={() => setDepOpen(true)}>Nạp tiền</Button>} />
            ) : (
              <Table>
                <thead><tr><TH>Mã nạp</TH><TH>Thời gian</TH><TH align="right">Số tiền</TH><TH>Trạng thái</TH></tr></thead>
                <tbody>
                  {deps.data.items.map((d: any) => (
                    <tr key={d.code}>
                      <TD className="font-mono text-xs">{d.code}</TD>
                      <TD className="text-muted">{dateTime(d.createdAt)}</TD>
                      <TD align="right" className="font-semibold">{vnd(d.amountReceived ?? d.amount)}</TD>
                      <TD><StatusBadge map={DEPOSIT_STATUS} value={d.status} /></TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {deps.data && <Pagination page={deps.data.page} pageSize={deps.data.pageSize} total={deps.data.total} onChange={setPage} />}
          </>
        )}
        {tab === 'claims' && (
          <CardBody className="pt-4">
            {!claims.data?.length ? (
              <EmptyState title="Không có yêu cầu đối soát" description="Nếu bạn chuyển khoản nhưng ghi sai nội dung, hãy gửi yêu cầu kèm ảnh biên lai." />
            ) : (
              <ul className="space-y-2">
                {claims.data.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                    <span>{vnd(c.amount)} · chuyển lúc {dateTime(c.transferAt)}{c.handleNote && <span className="block text-xs text-muted">Phản hồi: {c.handleNote}</span>}</span>
                    <StatusBadge map={{ PENDING: { label: 'Chờ đối soát', tone: 'warning' }, APPROVED: { label: 'Đã cộng tiền', tone: 'success' }, REJECTED: { label: 'Từ chối', tone: 'danger' } }} value={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        )}
      </Card>
      <DepositModal open={depOpen} onClose={() => setDepOpen(false)} />
      <Modal open={claimOpen} onClose={() => setClaimOpen(false)} title="Báo chuyển khoản sai nội dung" footer={<><Button variant="ghost" onClick={() => setClaimOpen(false)}>Huỷ</Button><Button loading={busy} disabled={!claim.amount || !claim.transferAt} onClick={submitClaim}>Gửi yêu cầu</Button></>}>
        <div className="space-y-3">
          <p className="rounded-lg bg-info-soft p-2.5 text-xs text-info">Kế toán sẽ đối chiếu sao kê ngân hàng. Việc cộng tiền thủ công luôn cần 2 nhân sự duyệt để đảm bảo an toàn.</p>
          <Field label="Số tiền đã chuyển">{(id) => <Input id={id} inputMode="numeric" value={claim.amount} onChange={(e) => setClaim({ ...claim, amount: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')).toLocaleString('vi-VN') : '' })} />}</Field>
          <Field label="Thời điểm chuyển">{(id) => <Input id={id} type="datetime-local" value={claim.transferAt} onChange={(e) => setClaim({ ...claim, transferAt: e.target.value })} />}</Field>
          <Field label="Ghi chú">{(id) => <Textarea id={id} value={claim.note} onChange={(e) => setClaim({ ...claim, note: e.target.value })} placeholder="Ngân hàng chuyển, nội dung đã ghi…" maxLength={500} />}</Field>
          <div><p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh biên lai</p><ImageUpload purpose="receipt" value={receipt} onChange={setReceipt} /></div>
        </div>
      </Modal>
    </div>
  );
}
