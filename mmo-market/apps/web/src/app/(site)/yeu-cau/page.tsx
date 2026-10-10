'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, EmptyState, Input, LevelBadge, POST_STATUS, Pagination, Select, Skeleton, StatusBadge, cn, num, shortVnd, timeAgo } from '@mmo/ui';
import { Clock, Eye, MessageSquare, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { useCategories } from '@/lib/hooks';

function Board() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: cats } = useCategories();
  const [q, setQ] = useState(params.get('q') ?? '');
  const qs = params.toString();
  const { data, isLoading } = useQuery({ queryKey: ['requests', qs], queryFn: () => api<any>(`/requests?${qs}`), placeholderData: keepPreviousData });
  const update = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(k, v);
    else p.delete(k);
    if (k !== 'page') p.delete('page');
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="container-page py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chợ yêu cầu</h1>
          <p className="text-sm text-muted">Người mua đăng thứ cần tìm, người bán báo giá. Chốt báo giá là tạo đơn có ký quỹ.</p>
        </div>
        <Link href="/yeu-cau/moi"><Button><Plus className="h-4 w-4" /> Đăng yêu cầu</Button></Link>
      </div>
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <form className="min-w-[200px] flex-1" onSubmit={(e) => { e.preventDefault(); update('q', q.trim() || null); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm yêu cầu…" />
        </form>
        <Select className="w-auto" value={params.get('category') ?? ''} onChange={(e) => update('category', e.target.value || null)}>
          <option value="">Tất cả danh mục</option>
          {cats?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select className="w-auto" value={params.get('status') ?? ''} onChange={(e) => update('status', e.target.value || null)}>
          <option value="">Đang mở & đã chốt</option>
          <option value="OPEN">Đang mở</option>
          <option value="FULFILLED">Đã chốt</option>
          <option value="EXPIRED">Hết hạn</option>
        </Select>
        <Select className="w-auto" value={params.get('sort') ?? 'newest'} onChange={(e) => update('sort', e.target.value)}>
          <option value="newest">Mới nhất</option>
          <option value="ending_soon">Sắp hết hạn</option>
          <option value="most_offers">Nhiều báo giá</option>
          <option value="most_comments">Nhiều bình luận</option>
        </Select>
      </Card>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !data?.items.length ? (
        <Card><EmptyState title="Chưa có yêu cầu phù hợp" action={<Link href="/yeu-cau/moi"><Button variant="secondary">Đăng yêu cầu đầu tiên</Button></Link>} /></Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((p: any) => {
            const ending = p.status === 'OPEN' && new Date(p.deadlineAt).getTime() - Date.now() < 24 * 3600_000;
            return (
              <Link key={p.id} href={`/yeu-cau/${p.id}`} className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge map={POST_STATUS} value={p.status} />
                  {p.category && <span className="text-muted">{p.category.name}</span>}
                  <span className={cn('ml-auto inline-flex items-center gap-1', ending ? 'text-danger' : 'text-muted')}>
                    <Clock className="h-3.5 w-3.5" /> {p.status === 'OPEN' ? `hạn ${timeAgo(p.deadlineAt).replace(' trước', '')}` : timeAgo(p.createdAt)}
                  </span>
                </div>
                <h2 className="mt-2 font-semibold text-fg">{p.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{p.excerpt}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  {(p.budgetMin || p.budgetMax) && <span className="font-semibold text-success">💰 {shortVnd(p.budgetMin ?? 0)} – {shortVnd(p.budgetMax ?? 0)}</span>}
                  {p.quantity && <span>SL: {num(p.quantity)}</span>}
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {p.commentCount}</span>
                  <span className="inline-flex items-center gap-1"><Send className="h-3.5 w-3.5" /> {p.offerCount} báo giá</span>
                  <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {num(p.viewCount)}</span>
                  <span className="ml-auto inline-flex items-center gap-1.5"><Avatar src={p.author.avatarUrl} name={p.author.displayName} size={18} /> {p.author.displayName} {p.author.store && <LevelBadge level={p.author.store.level} />}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(pg) => update('page', String(pg))} />}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}
