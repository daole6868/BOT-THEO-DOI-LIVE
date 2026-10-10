'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, EmptyState, LevelBadge, Pagination, Stars, Tabs, dateOnly, hoursLabel, num, timeAgo, useToast } from '@mmo/ui';
import { Heart, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { ReportButton } from '@/components/ReportButton';
import { api, errMsg } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export function StoreView({ initial }: { initial: any }) {
  const [s, setS] = useState(initial);
  const [tab, setTab] = useState<'products' | 'reviews' | 'about'>('products');
  const [page, setPage] = useState(1);
  const [rpage, setRpage] = useState(1);
  const { data: me } = useMe();
  const router = useRouter();
  const toast = useToast();
  const products = useQuery({ queryKey: ['store-products', s.slug, page], queryFn: () => api<any>(`/search/products?store=${s.slug}&page=${page}&pageSize=20&sort=best_selling`), enabled: tab === 'products' });
  const reviews = useQuery({ queryKey: ['store-reviews', s.slug, rpage], queryFn: () => api<any>(`/stores/${s.slug}/reviews?page=${rpage}`), enabled: tab === 'reviews' });

  const follow = async () => {
    if (!me?.user) return router.push(`/dang-nhap?next=/shop/${s.slug}`);
    try {
      const r = await api<{ following: boolean }>(`/stores/${s.slug}/follow`, { method: s.following ? 'DELETE' : 'POST' });
      setS({ ...s, following: r.following, followerCount: s.followerCount + (r.following ? 1 : -1) });
    } catch (e) {
      toast.error('Lỗi', errMsg(e));
    }
  };
  const chat = async () => {
    if (!me?.user) return router.push(`/dang-nhap?next=/shop/${s.slug}`);
    const c = await api<{ id: string }>('/chat/conversations', { body: { peerUserId: s.owner.id, context: { type: 'store', id: s.slug } } });
    router.push(`/tai-khoan/tin-nhan?c=${c.id}`);
  };
  const isOwner = me?.user?.store?.id === s.id;

  return (
    <div className="container-page py-6">
      <Card className="overflow-hidden">
        <div className="h-36 bg-gradient-to-r from-[#4f46e5] to-[#0891b2] sm:h-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.bannerUrl && <img src={s.bannerUrl} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <div className="-mt-10 rounded-full border-4 border-card bg-card">
            <Avatar src={s.avatarUrl} name={s.name} size={88} />
          </div>
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold sm:text-2xl">
              {s.name} <LevelBadge level={s.level} />
              <span className={`text-xs font-normal ${s.online ? 'text-success' : 'text-muted'}`}>● {s.online ? 'Đang online' : 'Offline'}</span>
            </h1>
            <p className="text-sm text-muted">Tham gia {dateOnly(s.createdAt)} · {num(s.followerCount)} người theo dõi</p>
            {s.status === 'VACATION' && <p className="mt-1 text-sm text-warning">Gian hàng đang tạm nghỉ{s.vacationUntil ? ` đến ${dateOnly(s.vacationUntil)}` : ''}.</p>}
          </div>
          {!isOwner && (
            <div className="flex gap-2">
              <Button variant={s.following ? 'secondary' : 'outline'} onClick={follow}><Heart className={`h-4 w-4 ${s.following ? 'fill-current' : ''}`} /> {s.following ? 'Đang theo dõi' : 'Theo dõi'}</Button>
              <Button onClick={chat}><MessageCircle className="h-4 w-4" /> Nhắn tin</Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-5">
          {[
            ['Đánh giá', <span key="r" className="flex items-center gap-1">{s.ratingAvg.toFixed(1)} <Stars value={s.ratingAvg} size={12} /></span>],
            ['Đơn hoàn tất', num(s.completedOrders)],
            ['Đã bán', num(s.soldCount)],
            ['Tỷ lệ khiếu nại', `${s.disputeRatePct}%`],
            ['Sản phẩm', num(s.productCount)],
          ].map(([l, v]) => (
            <div key={l as string} className="border-b border-r border-border px-4 py-3 last:border-r-0 sm:border-b-0">
              <p className="text-xs text-muted">{l}</p>
              <p className="font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-4">
        <Tabs value={tab} onChange={setTab} className="px-3" items={[{ value: 'products', label: 'Sản phẩm', count: s.productCount }, { value: 'reviews', label: 'Đánh giá', count: s.ratingCount }, { value: 'about', label: 'Giới thiệu & chính sách' }]} />
        <div className="p-4">
          {tab === 'products' &&
            (products.data?.items.length ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{products.data.items.map((p: any) => <ProductCard key={p.id} p={p} />)}</div>
                <Pagination page={products.data.page} pageSize={products.data.pageSize} total={products.data.total} onChange={setPage} />
              </>
            ) : (
              <EmptyState title="Gian hàng chưa có sản phẩm" />
            ))}
          {tab === 'reviews' && (
            <ul className="divide-y divide-border">
              {reviews.data?.items.map((r: any) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Avatar src={r.buyer.avatarUrl} name={r.buyer.displayName} size={24} /> {r.buyer.displayName} <Stars value={r.rating} size={12} /> <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{r.productTitle}</p>
                  <p className="mt-1 text-sm">{r.content}</p>
                  {r.sellerReply && <p className="mt-1.5 rounded-lg bg-subtle p-2 text-sm"><b>Shop:</b> {r.sellerReply}</p>}
                </li>
              ))}
              {reviews.data && <Pagination page={reviews.data.page} pageSize={reviews.data.pageSize} total={reviews.data.total} onChange={setRpage} />}
            </ul>
          )}
          {tab === 'about' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div><p className="mb-2 font-semibold">Giới thiệu</p><p className="whitespace-pre-wrap text-sm text-fg2">{s.description || 'Chưa có giới thiệu.'}</p></div>
              <div><p className="mb-2 font-semibold">Chính sách bảo hành</p><p className="whitespace-pre-wrap text-sm text-fg2">{s.policy || 'Theo chính sách chung của sàn.'}</p><p className="mt-2 text-sm text-muted">Bảo hành mặc định: {hoursLabel(s.defaultWarrantyHours)}</p></div>
            </div>
          )}
        </div>
      </Card>
      <div className="mt-3 flex justify-end"><ReportButton targetType="STORE" targetId={s.id} /></div>
    </div>
  );
}
