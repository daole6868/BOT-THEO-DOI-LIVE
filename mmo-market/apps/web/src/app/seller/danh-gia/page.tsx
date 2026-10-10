'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarList, Button, Card, EmptyState, PageHeader, Pagination, Stars, Switch, Textarea, cn, dateTime, num, timeAgo, useToast } from '@mmo/ui';
import { MessageSquareReply, Star } from 'lucide-react';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';

function ReplyBox({ id, onDone }: { id: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="mt-3 space-y-2">
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cảm ơn bạn đã ủng hộ shop…" maxLength={1000} />
      <Button
        size="sm"
        loading={busy}
        disabled={text.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/seller/reviews/${id}/reply`, { body: { reply: text } });
            toast.success('Đã trả lời đánh giá');
            onDone();
          } catch (e) {
            toast.error('Không gửi được', errMsg(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Gửi trả lời
      </Button>
    </div>
  );
}

export default function SellerReviewsPage() {
  const [rating, setRating] = useState(0);
  const [unreplied, setUnreplied] = useState(false);
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ['seller-reviews', rating, unreplied, page],
    queryFn: () => api<any>(`/seller/reviews?page=${page}${rating ? `&rating=${rating}` : ''}${unreplied ? '&unreplied=1' : ''}`),
    placeholderData: keepPreviousData,
  });
  const dist = data?.distribution ?? {};
  const total = [1, 2, 3, 4, 5].reduce((s, r) => s + (dist[r] ?? 0), 0);
  const avg = total ? [1, 2, 3, 4, 5].reduce((s, r) => s + r * (dist[r] ?? 0), 0) / total : 0;

  return (
    <div>
      <PageHeader title="Đánh giá" subtitle="Trả lời đánh giá giúp người mua sau tin tưởng hơn. Mỗi đánh giá chỉ trả lời được một lần." />
      <div className="mb-5 grid gap-4 md:grid-cols-[220px_1fr]">
        <Card className="flex flex-col items-center justify-center p-5 text-center">
          <p className="text-4xl font-bold tabular">{avg.toFixed(1)}</p>
          <Stars value={avg} size={18} className="mt-1" />
          <p className="mt-1 text-sm text-muted">{num(total)} đánh giá</p>
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Phân bố số sao <span className="font-normal text-muted">(bấm để lọc)</span></p>
          <BarList
            items={[5, 4, 3, 2, 1].map((r) => ({ key: String(r), label: <span className={cn(rating === r && 'font-semibold text-primary')}>{r} sao</span>, value: dist[r] ?? 0 }))}
            onClick={(k) => { setRating(rating === Number(k) ? 0 : Number(k)); setPage(1); }}
          />
        </Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          {[0, 5, 4, 3, 2, 1].map((r) => (
            <button key={r} type="button" onClick={() => { setRating(r); setPage(1); }} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', rating === r ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg2')}>
              {r ? <>{r} <Star className="h-3 w-3 fill-current" /></> : 'Tất cả'}
            </button>
          ))}
          <span className="ml-auto"><Switch checked={unreplied} onChange={(v) => { setUnreplied(v); setPage(1); }} label="Chưa trả lời" /></span>
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có đánh giá" />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((r: any) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} />
                  <span className="text-sm font-medium">{r.order.buyer.displayName}</span>
                  <span className="text-xs text-muted">· {r.order.title} ({r.order.variantName}) · {timeAgo(r.createdAt)}</span>
                </div>
                {r.content && <p className="mt-2 whitespace-pre-wrap text-sm">{r.content}</p>}
                {r.sellerReply ? (
                  <div className="mt-3 rounded-lg border-l-2 border-primary bg-subtle p-3 text-sm">
                    <p className="text-xs font-semibold text-primary">Shop trả lời · {dateTime(r.sellerRepliedAt ?? r.updatedAt)}</p>
                    <p className="whitespace-pre-wrap">{r.sellerReply}</p>
                  </div>
                ) : replying === r.id ? (
                  <ReplyBox id={r.id} onDone={() => { setReplying(null); refetch(); }} />
                ) : (
                  <button type="button" onClick={() => setReplying(r.id)} className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"><MessageSquareReply className="h-4 w-4" /> Trả lời</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
