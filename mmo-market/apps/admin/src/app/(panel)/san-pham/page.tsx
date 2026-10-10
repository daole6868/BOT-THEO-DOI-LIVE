'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, LevelBadge, PRODUCT_STATUS, PageHeader, Pagination, StatusBadge, cn, timeAgo, vnd } from '@mmo/ui';
import { Ban, CheckCircle2, ChevronDown, Hand, RotateCcw, XCircle, Zap } from 'lucide-react';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

type Action = 'approve' | 'reject' | 'block' | 'unblock';

export default function ProductModeration() {
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; action: Action; title: string } | null>(null);
  const params = new URLSearchParams({ page: String(page), ...(status && { status }), ...(q && { q }) });
  const { data, refetch } = useQuery({ queryKey: ['adm-products', params.toString()], queryFn: () => api<any>(`/admin/products?${params}`), placeholderData: keepPreviousData });

  const act = async (id: string, action: Action, note?: string) => {
    const ok = await run(id + action, () => api(`/admin/products/${id}/moderate`, { body: { action, note: note || undefined } }), { approve: 'Đã duyệt sản phẩm', reject: 'Đã từ chối', block: 'Đã khoá sản phẩm', unblock: 'Đã mở khoá' }[action]);
    if (ok) {
      setPending(null);
      refetch();
      qc.invalidateQueries({ queryKey: ['queues'] });
    }
  };

  return (
    <div>
      <PageHeader title="Duyệt sản phẩm" subtitle="Gian hàng cấp Bạc trở lên được duyệt tự động; các sản phẩm khác chờ kiểm duyệt ở đây." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tên sản phẩm hoặc gian hàng" className="w-full sm:w-64" />
          <Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: 'PENDING_REVIEW', label: 'Chờ duyệt' }, { value: 'ACTIVE', label: 'Đang bán' }, { value: 'REJECTED', label: 'Từ chối' }, { value: 'BLOCKED', label: 'Bị khoá' }, { value: 'HIDDEN', label: 'Đã ẩn' }, { value: '', label: 'Tất cả' }]} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có sản phẩm" description={status === 'PENDING_REVIEW' ? 'Hàng đợi duyệt trống.' : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((p: any) => {
              const prices = p.variants.map((v: any) => Number(v.price));
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              return (
                <li key={p.id} className="p-4">
                  <div className="flex gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.images[0] ? <img src={p.images[0]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" /> : <div className="h-20 w-20 shrink-0 rounded-lg bg-subtle" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge map={PRODUCT_STATUS} value={p.status} />
                        <span className="inline-flex items-center gap-1 text-xs text-muted">{p.deliveryType === 'AUTO' ? <><Zap className="h-3 w-3" /> Tự động</> : <><Hand className="h-3 w-3" /> Thủ công</>}</span>
                        <span className="text-xs text-muted">· {p.category.name} · cập nhật {timeAgo(p.updatedAt)}</span>
                      </div>
                      <p className="mt-1 font-semibold">{p.title}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-fg2">{p.store.name} <LevelBadge level={p.store.level} /> · {min === max ? vnd(min) : `${vnd(min)} – ${vnd(max)}`} · {p.variants.length} gói</p>
                      {p.moderationNote && <p className="mt-1 text-xs text-danger">Ghi chú: {p.moderationNote}</p>}
                      <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                        {open === p.id ? 'Ẩn mô tả' : 'Xem mô tả & thuộc tính'} <ChevronDown className={cn('h-3 w-3 transition', open === p.id && 'rotate-180')} />
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      {p.status === 'PENDING_REVIEW' && <Button size="sm" variant="success" loading={busy === p.id + 'approve'} onClick={() => act(p.id, 'approve')}><CheckCircle2 className="h-4 w-4" /> Duyệt</Button>}
                      {p.status === 'PENDING_REVIEW' && <Button size="sm" variant="outline" onClick={() => setPending({ id: p.id, action: 'reject', title: p.title })}><XCircle className="h-4 w-4" /> Từ chối</Button>}
                      {p.status !== 'BLOCKED' ? (
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPending({ id: p.id, action: 'block', title: p.title })}><Ban className="h-4 w-4" /> Khoá</Button>
                      ) : (
                        <Button size="sm" variant="outline" loading={busy === p.id + 'unblock'} onClick={() => act(p.id, 'unblock')}><RotateCcw className="h-4 w-4" /> Mở khoá</Button>
                      )}
                    </div>
                  </div>
                  {open === p.id && (
                    <div className="mt-3 grid gap-3 rounded-xl bg-subtle p-4 text-sm md:grid-cols-[1fr_260px]">
                      <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-fg2">{p.descriptionMd}</p>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted">Gói bán</p>
                        {p.variants.map((v: any) => <p key={v.name} className="flex justify-between gap-2"><span>{v.name}</span><b className="tabular">{vnd(v.price)}</b></p>)}
                        <p className="pt-2 text-xs font-semibold text-muted">Thuộc tính</p>
                        <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(p.attrs, null, 1)}</pre>
                        {p.images.length > 1 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.images.map((src: string) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="h-12 w-12 rounded object-cover" /></a>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <ReasonModal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending?.action === 'block' ? 'Khoá sản phẩm' : 'Từ chối sản phẩm'}
        label="Lý do (người bán sẽ nhận được thông báo)"
        danger
        onSubmit={(note) => act(pending!.id, pending!.action, note)}
      >
        <p className="text-sm font-medium">{pending?.title}</p>
      </ReasonModal>
    </div>
  );
}
