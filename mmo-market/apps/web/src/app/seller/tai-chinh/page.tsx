'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pagination, Select, StatCard, StatusBadge, TD, TH, TXN_TYPES, Table, WITHDRAWAL_STATUS, cn, dateTime, remaining, vnd, useToast } from '@mmo/ui';
import { ArrowUpRight, Banknote, Clock, Landmark, Plus, ShieldAlert, Trash2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, errMsg, uuid } from '@/lib/api';
import { useMe, useWallet } from '@/lib/hooks';

const LIMITS: Record<string, number> = { NEW: 5_000_000, BRONZE: 20_000_000, SILVER: 50_000_000, GOLD: 200_000_000, DIAMOND: 1_000_000_000 };
const digits = (s: string) => s.replace(/\D/g, '');
const fmt = (s: string) => (digits(s) ? Number(digits(s)).toLocaleString('vi-VN') : '');

function PinInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Field label="Mã PIN giao dịch">{(id) => <Input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={value} onChange={(e) => onChange(digits(e.target.value))} placeholder="••••••" />}</Field>;
}

export default function SellerFinancePage() {
  const { data: me } = useMe();
  const { data: w } = useWallet();
  const qc = useQueryClient();
  const toast = useToast();
  const banks = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api<any[]>('/wallet/bank-accounts') });
  const bankList = useQuery({ queryKey: ['bank-list'], queryFn: () => api<{ code: string; name: string }[]>('/stores/banks'), staleTime: Infinity });
  const [wPage, setWPage] = useState(1);
  const wds = useQuery({ queryKey: ['withdrawals', wPage], queryFn: () => api<any>(`/wallet/withdrawals?page=${wPage}`) });
  const [tPage, setTPage] = useState(1);
  const income = useQuery({ queryKey: ['txns-income', tPage], queryFn: () => api<any>(`/wallet/transactions?page=${tPage}&type=escrow_release`) });

  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState({ bankCode: '', accountNumber: '', holderName: '', pin: '' });
  const [wdOpen, setWdOpen] = useState(false);
  const [wd, setWd] = useState({ bankAccountId: '', amount: '', pin: '' });
  const idem = useMemo(() => uuid(), [wdOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const u = me?.user;
  const level = u?.store?.level ?? 'NEW';
  const usable = (banks.data ?? []).filter((b) => !b.cooldownUntil || new Date(b.cooldownUntil) < new Date());

  const run = async (fn: () => Promise<unknown>, ok: string, after: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      after();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['wallet'] });
    qc.invalidateQueries({ queryKey: ['withdrawals'] });
    qc.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tài chính"
        subtitle="Tiền bán hàng được giữ trong ký quỹ tới khi hết bảo hành, sau đó tự động vào số dư khả dụng."
        actions={<Button disabled={!usable.length || !u?.hasPin} onClick={() => { setWd({ bankAccountId: usable[0]?.id ?? '', amount: '', pin: '' }); setWdOpen(true); }}><ArrowUpRight className="h-4 w-4" /> Rút tiền</Button>}
      />
      {!u?.hasPin && (
        <p className="flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning"><ShieldAlert className="h-4 w-4" /> Bạn cần <Link href="/tai-khoan/bao-mat" className="font-semibold underline">đặt mã PIN giao dịch</Link> trước khi thêm ngân hàng hoặc rút tiền.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Số dư khả dụng" value={w ? vnd(w.available) : '…'} icon={<Wallet className="h-4 w-4" />} hint="Có thể rút ngay" />
        <StatCard label="Đang giữ ký quỹ" value={w ? vnd(w.incomingEscrow) : '…'} icon={<Clock className="h-4 w-4" />} hint="Chờ hết bảo hành" href="/seller/don-hang?status=DELIVERED" />
        <StatCard label="Đang chờ rút" value={w ? vnd(w.pendingWithdrawal) : '…'} icon={<Banknote className="h-4 w-4" />} hint="Lệnh rút đang xử lý" />
        <StatCard label="Hạn mức rút 24 giờ" value={vnd(LIMITS[level] ?? LIMITS.NEW)} icon={<Landmark className="h-4 w-4" />} hint={`Theo cấp gian hàng ${level}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader title="Lệnh rút tiền" />
          {!wds.data?.items.length ? (
            <EmptyState title="Chưa có lệnh rút" description="Thêm tài khoản ngân hàng (trùng tên KYC) để rút tiền." />
          ) : (
            <Table>
              <thead><tr><TH>Mã</TH><TH>Thời gian</TH><TH>Ngân hàng</TH><TH align="right">Số tiền</TH><TH>Trạng thái</TH><TH /></tr></thead>
              <tbody>
                {wds.data.items.map((x: any) => (
                  <tr key={x.code}>
                    <TD className="font-mono text-xs">{x.code}</TD>
                    <TD className="whitespace-nowrap text-muted">{dateTime(x.createdAt)}</TD>
                    <TD className="text-fg2">{x.bank}</TD>
                    <TD align="right" className="whitespace-nowrap font-semibold">{vnd(x.amount)}</TD>
                    <TD>
                      <StatusBadge map={WITHDRAWAL_STATUS} value={x.status} />
                      {x.rejectReason && <p className="mt-0.5 text-xs text-danger">{x.rejectReason}</p>}
                      {x.bankRef && <p className="mt-0.5 text-xs text-muted">Mã GD: {x.bankRef}</p>}
                    </TD>
                    <TD align="right">
                      {['REQUESTED', 'ON_HOLD'].includes(x.status) && (
                        <button type="button" className="text-xs text-danger hover:underline" onClick={() => confirm('Huỷ lệnh rút này? Tiền sẽ trả lại số dư khả dụng.') && run(() => api(`/wallet/withdrawals/${x.code}/cancel`, { method: 'POST' }), 'Đã huỷ lệnh rút', refresh)}>Huỷ</button>
                      )}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {wds.data && <Pagination page={wds.data.page} pageSize={wds.data.pageSize} total={wds.data.total} onChange={setWPage} />}
        </Card>

        <Card>
          <CardHeader title="Tài khoản nhận tiền" subtitle="Tối đa 3 tài khoản, phải trùng họ tên KYC" action={<Button size="sm" variant="outline" disabled={!u?.hasPin || (banks.data?.length ?? 0) >= 3} onClick={() => { setBank({ bankCode: bankList.data?.[0]?.code ?? '', accountNumber: '', holderName: '', pin: '' }); setBankOpen(true); }}><Plus className="h-4 w-4" /> Thêm</Button>} />
          <CardBody className="space-y-2 pt-0">
            {!banks.data?.length && <p className="py-6 text-center text-sm text-muted">Chưa có tài khoản</p>}
            {banks.data?.map((b) => {
              const cooling = b.cooldownUntil && new Date(b.cooldownUntil) > new Date();
              return (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Landmark className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{b.bankName}</p>
                    <p className="text-xs text-muted">****{b.accountLast4} · {b.holderName}</p>
                    {cooling && <Badge tone="warning" className="mt-1">Dùng được sau {remaining(new Date(b.cooldownUntil).getTime() - Date.now())}</Badge>}
                  </div>
                  <button type="button" aria-label="Xoá" className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => confirm('Xoá tài khoản ngân hàng này?') && run(() => api(`/wallet/bank-accounts/${b.id}`, { method: 'DELETE' }), 'Đã xoá', refresh)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-muted">Vì an toàn, tài khoản mới thêm chỉ rút được sau 48 giờ. Đổi mật khẩu/2FA sẽ tạm khoá rút tiền 24 giờ.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Tiền bán hàng đã giải ngân" subtitle="Đã trừ phí sàn" />
        {!income.data?.items.length ? (
          <EmptyState title="Chưa có khoản giải ngân" />
        ) : (
          <Table>
            <thead><tr><TH>Thời gian</TH><TH>Nội dung</TH><TH align="right">Số tiền</TH><TH align="right">Số dư sau</TH></tr></thead>
            <tbody>
              {income.data.items.map((t: any) => (
                <tr key={t.id}>
                  <TD className="whitespace-nowrap text-muted">{dateTime(t.createdAt)}</TD>
                  <TD className="text-fg2">{t.description || TXN_TYPES[t.type]}</TD>
                  <TD align="right" className={cn('font-semibold', t.amount > 0 && 'text-success')}>{t.amount > 0 ? '+' : ''}{vnd(t.amount)}</TD>
                  <TD align="right" className="text-muted">{vnd(t.balanceAfter)}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {income.data && <Pagination page={income.data.page} pageSize={income.data.pageSize} total={income.data.total} onChange={setTPage} />}
      </Card>

      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title="Thêm tài khoản ngân hàng" footer={<><Button variant="ghost" onClick={() => setBankOpen(false)}>Huỷ</Button><Button loading={busy} disabled={!bank.bankCode || bank.accountNumber.length < 6 || bank.holderName.trim().length < 4 || bank.pin.length !== 6} onClick={() => run(() => api('/wallet/bank-accounts', { body: bank }), 'Đã thêm tài khoản – dùng được sau 48 giờ', () => { setBankOpen(false); refresh(); })}>Thêm tài khoản</Button></>}>
        <div className="space-y-3">
          <Field label="Ngân hàng">{(id) => <Select id={id} value={bank.bankCode} onChange={(e) => setBank({ ...bank, bankCode: e.target.value })}>{bankList.data?.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</Select>}</Field>
          <Field label="Số tài khoản">{(id) => <Input id={id} inputMode="numeric" maxLength={19} value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: digits(e.target.value) })} />}</Field>
          <Field label="Tên chủ tài khoản" hint="Không dấu, trùng họ tên trên giấy tờ đã xác minh">{(id) => <Input id={id} value={bank.holderName} onChange={(e) => setBank({ ...bank, holderName: e.target.value.toUpperCase() })} />}</Field>
          <PinInput value={bank.pin} onChange={(pin) => setBank({ ...bank, pin })} />
          <p className="text-xs text-muted">Có thể cần nhập mã 2FA để xác nhận thao tác nhạy cảm.</p>
        </div>
      </Modal>

      <Modal open={wdOpen} onClose={() => setWdOpen(false)} title="Tạo lệnh rút tiền" footer={<><Button variant="ghost" onClick={() => setWdOpen(false)}>Huỷ</Button><Button loading={busy} disabled={!wd.bankAccountId || Number(digits(wd.amount)) < 50_000 || wd.pin.length !== 6} onClick={() => run(() => api('/wallet/withdrawals', { body: { bankAccountId: wd.bankAccountId, amount: Number(digits(wd.amount)), pin: wd.pin }, idem }), 'Đã tạo lệnh rút', () => { setWdOpen(false); refresh(); })}>Xác nhận rút</Button></>}>
        <div className="space-y-3">
          <Field label="Về tài khoản">{(id) => <Select id={id} value={wd.bankAccountId} onChange={(e) => setWd({ ...wd, bankAccountId: e.target.value })}>{usable.map((b) => <option key={b.id} value={b.id}>{b.bankName} ****{b.accountLast4}</option>)}</Select>}</Field>
          <Field label="Số tiền" hint={<>Khả dụng {w ? vnd(w.available) : '…'} · tối thiểu 50.000đ · <button type="button" className="text-primary" onClick={() => setWd({ ...wd, amount: fmt(String(w?.available ?? 0)) })}>Rút hết</button></>}>
            {(id) => <Input id={id} inputMode="numeric" value={wd.amount} onChange={(e) => setWd({ ...wd, amount: fmt(e.target.value) })} />}
          </Field>
          <PinInput value={wd.pin} onChange={(pin) => setWd({ ...wd, pin })} />
          <p className="rounded-lg bg-info-soft p-2.5 text-xs text-info">Lệnh rút được kế toán duyệt trong giờ hành chính. Lệnh lớn cần 2 người duyệt. Bạn sẽ nhận email cho mọi thay đổi.</p>
        </div>
      </Modal>
    </div>
  );
}
