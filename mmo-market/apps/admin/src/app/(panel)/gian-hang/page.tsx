'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, Field, LEVELS, LevelBadge, Modal, PageHeader, Pagination, Select, StatusBadge, TD, TH, Table, Textarea, cn, num, pct } from '@mmo/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { STORE_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

function Stores() {
  const sp = useSearchParams();
  const can = useCan();
  const { run, busy } = useRun();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ level: '', fee: '', status: '', reason: '' });
  const params = new URLSearchParams({ page: String(page), ...(q && { q }), ...(level && { level }), ...(status && { status }) });
  const { data, refetch } = useQuery({ queryKey: ['adm-stores', params.toString()], queryFn: () => api<any>(`/admin/stores?${params}`), placeholderData: keepPreviousData });

  const open = (s: any) => {
    setEdit(s);
    setForm({ level: s.level, fee: s.feeOverrideBps != null ? String(s.feeOverrideBps / 100) : '', status: s.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE', reason: '' });
  };
  const save = () =>
    run(
      'save',
      () =>
        api(`/admin/stores/${edit.id}`, {
          method: 'PATCH',
          body: { reason: form.reason, level: form.level, feeOverrideBps: form.fee === '' ? null : Math.round(Number(form.fee) * 100), ...(form.status !== (edit.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE') ? { status: form.status } : {}) },
        }),
      'Đã cập nhật gian hàng',
    ).then((ok): unknown => ok && (setEdit(null), refetch()));

  return (
    <div>
      <PageHeader title="Gian hàng" subtitle="Sắp xếp theo số đơn hoàn tất. Tỷ lệ khiếu nại > 3% được tô đỏ." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tên hoặc đường dẫn shop" className="w-full sm:w-64" />
          <Chips value={level} onChange={(v) => { setLevel(v); setPage(1); }} items={[{ value: '', label: 'Mọi cấp' }, ...Object.entries(LEVELS).map(([k, v]) => ({ value: k, label: v.label }))]} />
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: '', label: 'Mọi trạng thái' }, ...Object.entries(STORE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có gian hàng" />
        ) : (
          <Table>
            <thead><tr><TH>Gian hàng</TH><TH>Chủ shop</TH><TH>Cấp</TH><TH align="right">Hoàn tất</TH><TH align="right">Khiếu nại</TH><TH align="right">Đánh giá</TH><TH align="right">Phí riêng</TH><TH>Trạng thái</TH><TH /></tr></thead>
            <tbody>
              {data.items.map((s: any) => (
                <tr key={s.id}>
                  <TD><a href={`${process.env.NEXT_PUBLIC_WEB_URL}/shop/${s.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:text-primary">{s.name}</a><p className="text-xs text-muted">/{s.slug}</p></TD>
                  <TD><Link href={`/nguoi-dung/${s.owner.id}`} className="text-fg2 hover:text-primary">@{s.owner.username}</Link></TD>
                  <TD><LevelBadge level={s.level} /></TD>
                  <TD align="right">{num(s.completedOrders)}</TD>
                  <TD align="right"><span className={cn(s.disputeRatePct > 3 && 'font-semibold text-danger')}>{pct(s.disputeRatePct)}</span></TD>
                  <TD align="right">★ {s.ratingAvg.toFixed(1)} <span className="text-xs text-muted">({s.ratingCount})</span></TD>
                  <TD align="right">{s.feeOverrideBps != null ? pct(s.feeOverrideBps / 100) : <span className="text-muted">—</span>}</TD>
                  <TD><StatusBadge map={STORE_STATUS} value={s.status} />{s.suspendReason && <p className="mt-0.5 max-w-[180px] truncate text-xs text-danger" title={s.suspendReason}>{s.suspendReason}</p>}</TD>
                  <TD align="right">{can('store.manage') && <Button size="sm" variant="outline" onClick={() => open(s)}>Điều chỉnh</Button>}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Điều chỉnh: ${edit?.name ?? ''}`} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Huỷ</Button><Button loading={busy === 'save'} disabled={form.reason.trim().length < 5} onClick={save}>Lưu thay đổi</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cấp gian hàng">{(id) => <Select id={id} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
            <Field label="Phí riêng (%)" hint="Để trống = theo danh mục">{(id) => <input id={id} type="number" min={0} max={50} step={0.1} value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" />}</Field>
          </div>
          <Field label="Trạng thái">{(id) => <Select id={id} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="ACTIVE">Cho phép bán</option><option value="SUSPENDED">Tạm khoá gian hàng</option></Select>}</Field>
          <Field label="Lý do (ghi nhật ký, hiển thị cho chủ shop nếu khoá)">{(id) => <Textarea id={id} rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} />}</Field>
        </div>
      </Modal>
    </div>
  );
}

export default function StoresPage() {
  return (
    <Suspense>
      <Stores />
    </Suspense>
  );
}
