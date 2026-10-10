'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, CardBody, EmptyState, Pagination, TD, TH, TXN_TYPES, Table, cn, dateTime, timeAgo, vnd } from '@mmo/ui';
import { CheckCircle2, ChevronRight, ShieldCheck, XCircle } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { ACCOUNT_KIND } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

const ASSETS = ['PLATFORM_BANK', 'PLATFORM_ADJUSTMENT'];
const LIABS = ['USER_AVAILABLE', 'USER_PENDING_WITHDRAWAL', 'ESCROW', 'PLATFORM_FEE_REVENUE'];

export function Ledger() {
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [verify, setVerify] = useState<any>(null);
  const params = new URLSearchParams({ page: String(page), ...(type && { type }), ...(q && { q }) });
  const { data } = useQuery({ queryKey: ['adm-ledger', params.toString()], queryFn: () => api<any>(`/admin/finance/ledger?${params}`), placeholderData: keepPreviousData });
  const totals: Record<string, number> = Object.fromEntries((data?.totals ?? []).map((t: any) => [t.kind, Number(t.balance)]));
  const assets = ASSETS.reduce((s, k) => s + (totals[k] ?? 0), 0);
  const liabs = LIABS.reduce((s, k) => s + (totals[k] ?? 0), 0);

  return (
    <div>
      <CardBody className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted">Tài sản (dư Nợ)</p>
            {ASSETS.map((k) => <p key={k} className="flex justify-between text-sm"><span className="text-fg2">{ACCOUNT_KIND[k]}</span><b className="tabular">{vnd(totals[k] ?? 0)}</b></p>)}
            <p className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-sm font-semibold"><span>Tổng</span><span className="tabular">{vnd(assets)}</span></p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted">Nguồn vốn (dư Có)</p>
            {LIABS.map((k) => <p key={k} className="flex justify-between text-sm"><span className="text-fg2">{ACCOUNT_KIND[k]}</span><b className="tabular">{vnd(totals[k] ?? 0)}</b></p>)}
            <p className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-sm font-semibold"><span>Tổng</span><span className="tabular">{vnd(liabs)}</span></p>
          </div>
          <div className="flex flex-col justify-between gap-2 rounded-xl border border-border p-3 lg:w-64">
            <p className={cn('flex items-center gap-2 text-sm font-semibold', assets === liabs ? 'text-success' : 'text-danger')}>
              {assets === liabs ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {assets === liabs ? 'Hai vế cân bằng' : `Lệch ${vnd(assets - liabs)}`}
            </p>
            {verify && (
              <div className={cn('rounded-lg p-2 text-xs', verify.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
                {verify.ok ? 'Không phát hiện sai lệch' : verify.problems.map((p: string) => <p key={p}>{p}</p>)}
                <p className="mt-1 text-muted">Kiểm tra {timeAgo(verify.checkedAt)}</p>
              </div>
            )}
            <Button size="sm" variant="outline" loading={busy === 'verify'} onClick={() => run('verify', async () => { setVerify(await api('/admin/finance/ledger/verify', { method: 'POST' })); qc.invalidateQueries({ queryKey: ['admin-dashboard'] }); })}>
              <ShieldCheck className="h-4 w-4" /> Đối soát toàn bộ ngay
            </Button>
          </div>
        </div>
      </CardBody>
      <div className="flex flex-wrap items-center gap-3 px-3 pb-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Mã tham chiếu hoặc mô tả" className="w-60" />
        <Chips value={type} onChange={(v) => { setType(v); setPage(1); }} items={[{ value: '', label: 'Mọi loại' }, ...Object.entries(TXN_TYPES).map(([k, v]) => ({ value: k, label: v }))]} />
      </div>
      {!data?.items.length ? (
        <EmptyState title="Không có bút toán" />
      ) : (
        <Table>
          <thead><tr><TH /><TH>Thời gian</TH><TH>Loại</TH><TH>Mô tả</TH><TH align="right">Giá trị</TH><TH>Bút toán</TH></tr></thead>
          <tbody>
            {data.items.map((t: any) => {
              const amount = t.entries.filter((e: any) => e.side === 'D').reduce((s: number, e: any) => s + Number(e.amount), 0);
              return (
                <Fragment key={t.id}>
                  <tr className="cursor-pointer hover:bg-subtle/50" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <TD className="w-6"><ChevronRight className={cn('h-4 w-4 text-muted transition', open === t.id && 'rotate-90')} /></TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{dateTime(t.createdAt)}</TD>
                    <TD><Badge>{TXN_TYPES[t.type] ?? t.type}</Badge></TD>
                    <TD className="max-w-md truncate text-fg2">{t.description}</TD>
                    <TD align="right" className="whitespace-nowrap font-semibold">{vnd(amount)}</TD>
                    <TD className="text-xs text-muted">{t.entries.length} dòng</TD>
                  </tr>
                  {open === t.id && (
                    <tr>
                      <td colSpan={6} className="bg-subtle/60 px-6 py-3">
                        <table className="w-full text-xs">
                          <thead><tr className="text-muted"><th className="py-1 text-left font-medium">Tài khoản</th><th className="text-left font-medium">Loại</th><th className="text-right font-medium">Nợ</th><th className="text-right font-medium">Có</th><th className="text-right font-medium">Số dư sau</th></tr></thead>
                          <tbody>
                            {t.entries.map((e: any) => (
                              <tr key={e.id}>
                                <td className="py-1 font-mono">{e.account}</td>
                                <td>{ACCOUNT_KIND[e.kind] ?? e.kind}</td>
                                <td className="text-right tabular">{e.side === 'D' ? vnd(e.amount) : ''}</td>
                                <td className="text-right tabular">{e.side === 'C' ? vnd(e.amount) : ''}</td>
                                <td className="text-right tabular text-muted">{vnd(e.balanceAfter)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[11px] text-muted">Tham chiếu: {t.refType} · <span className="font-mono">{t.refId}</span> · khoá idempotency <span className="font-mono">{t.idempotencyKey}</span></p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </div>
  );
}
