'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, Field, LevelBadge, Pagination, Stars, Tabs, Textarea, cn, dateOnly, hoursLabel, num, timeAgo, useToast, vnd } from '@mmo/ui';
import { Clock, Lock, MessageCircle, Minus, Plus, ShieldCheck, Store, Truck, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DepositModal } from '@/components/DepositModal';
import { ReportButton } from '@/components/ReportButton';
import { api, ApiError, errMsg, uuid } from '@/lib/api';
import { useMe, useWallet } from '@/lib/hooks';
import { getSocket } from '@/lib/socket';

export interface ProductDetail {
  id: string;
  title: string;
  descriptionHtml: string;
  deliveryType: 'AUTO' | 'MANUAL';
  warrantyHours: number;
  serviceSlaHours: number | null;
  buyerInputLabel: string | null;
  images: string[];
  priceMin: number;
  stockTotal: number;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  viewCount: number;
  attributes: { key: string; label: string; display: string }[];
  breadcrumbs: { slug: string; name: string }[];
  variants: { id: string; name: string; price: number; compareAtPrice: number | null; unitsPerPurchase: number; minQty: number; maxQty: number; available: number | null }[];
  ratingDistribution: Record<string, number>;
  store: { id: string; slug: string; name: string; avatarUrl: string | null; level: string; status: string; vacationUntil: string | null; ratingAvg: number; ratingCount: number; soldCount: number; completedOrders: number; disputeRatePct: number; createdAt: string; ownerId: string; online: boolean };
}

function Reviews({ productId, dist, total }: { productId: string; dist: Record<string, number>; total: number }) {
  const [rating, setRating] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const { data } = useQuery({ queryKey: ['reviews', productId, rating, page], queryFn: () => api<any>(`/products/${productId}/reviews?page=${page}${rating ? `&rating=${rating}` : ''}`) });
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((r) => {
          const n = dist[r] ?? 0;
          return (
            <button key={r} type="button" onClick={() => { setRating(rating === r ? undefined : r); setPage(1); }} className={cn('flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-subtle', rating === r && 'bg-primary-soft')}>
              <span className="w-6 text-fg2">{r}★</span>
              <span className="h-2 flex-1 rounded-full bg-subtle"><span className="block h-2 rounded-full bg-[#f59e0b]" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
              <span className="w-8 text-right text-muted tabular">{n}</span>
            </button>
          );
        })}
      </div>
      <div>
        {!data?.items.length ? (
          <EmptyState title="Chưa có đánh giá" description="Đánh giá chỉ đến từ người mua đã hoàn tất đơn." />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((r: any) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center gap-2">
                  <Avatar src={r.buyer.avatarUrl} name={r.buyer.displayName} size={28} />
                  <span className="text-sm font-medium">{r.buyer.displayName}</span>
                  <Stars value={r.rating} size={12} />
                  <span className="text-xs text-muted">· {timeAgo(r.createdAt)}</span>
                </div>
                {r.variantName && <p className="mt-1 text-xs text-muted">Gói: {r.variantName}</p>}
                <p className="mt-1.5 text-sm text-fg2">{r.content}</p>
                {r.sellerReply && <div className="mt-2 rounded-lg bg-subtle p-2.5 text-sm"><span className="font-medium">Phản hồi của người bán: </span>{r.sellerReply}</div>}
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </div>
    </div>
  );
}

export function ProductView({ p: initial }: { p: ProductDetail }) {
  const [p, setP] = useState(initial);
  const { data: me } = useMe();
  const { data: wallet } = useWallet(!!me?.user);
  const router = useRouter();
  const toast = useToast();
  const [variantId, setVariantId] = useState(p.variants[0]?.id);
  const [qty, setQty] = useState(p.variants[0]?.minQty ?? 1);
  const [img, setImg] = useState(0);
  const [tab, setTab] = useState<'desc' | 'specs' | 'policy' | 'reviews'>('desc');
  const [buyerInput, setBuyerInput] = useState('');
  const [buying, setBuying] = useState(false);
  const [deposit, setDeposit] = useState<number | null>(null);
  const variant = p.variants.find((v) => v.id === variantId) ?? p.variants[0];
  const total = (variant?.price ?? 0) * qty;
  const max = Math.min(variant?.maxQty ?? 1, variant?.available ?? Infinity);
  const isOwner = me?.user?.store?.id === p.store.id;
  const out = p.deliveryType === 'AUTO' && (variant?.available ?? 0) < (variant?.minQty ?? 1);

  // Cập nhật tồn kho realtime khi người khác mua
  useEffect(() => {
    const s = getSocket();
    s.emit('room:join', { room: `product:${p.id}` });
    const h = async () => {
      const fresh = await api<ProductDetail>(`/products/${p.id}`).catch(() => null);
      if (fresh) setP(fresh);
    };
    s.on('stock:updated', h);
    return () => {
      s.off('stock:updated', h);
      s.emit('room:leave', { room: `product:${p.id}` });
    };
  }, [p.id]);

  const idem = useMemo(() => uuid(), [variantId, qty, buyerInput]);

  const buy = async () => {
    if (!me?.user) return router.push(`/dang-nhap?next=/san-pham/${p.id}`);
    if (wallet && wallet.available < total) return setDeposit(total - wallet.available);
    setBuying(true);
    try {
      const r = await api<{ code: string }>('/orders', { body: { variantId, qty, buyerInput: buyerInput || undefined }, idem });
      toast.success('Đặt hàng thành công', p.deliveryType === 'AUTO' ? 'Hàng đã được giao – xem ngay trong đơn hàng.' : 'Người bán sẽ nhận đơn và thực hiện.');
      router.push(`/tai-khoan/don-hang/${r.code}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INSUFFICIENT_BALANCE') setDeposit(Math.max(10_000, total - (wallet?.available ?? 0)));
      else toast.error('Không đặt được hàng', errMsg(e));
    } finally {
      setBuying(false);
    }
  };

  const chat = async () => {
    if (!me?.user) return router.push(`/dang-nhap?next=/san-pham/${p.id}`);
    try {
      const c = await api<{ id: string }>('/chat/conversations', { body: { peerUserId: p.store.ownerId, context: { type: 'product', id: p.id } } });
      router.push(`/tai-khoan/tin-nhan?c=${c.id}`);
    } catch (e) {
      toast.error('Không mở được cuộc trò chuyện', errMsg(e));
    }
  };

  return (
    <div className="container-page py-6">
      <nav className="mb-3 text-xs text-muted">
        <Link href="/" className="hover:text-fg">Trang chủ</Link>
        {p.breadcrumbs.map((b) => (
          <span key={b.slug}> › <Link href={`/danh-muc/${b.slug}`} className="hover:text-fg">{b.name}</Link></span>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.images[img] && <img src={p.images[img]} alt={p.title} className="h-full w-full object-cover" />}
          </div>
          {p.images.length > 1 && (
            <div className="mt-2 flex gap-2">
              {p.images.map((u, i) => (
                <button key={u} type="button" onClick={() => setImg(i)} className={cn('h-16 w-20 overflow-hidden rounded-lg border-2', i === img ? 'border-primary' : 'border-transparent')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold leading-snug sm:text-2xl">{p.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1"><Stars value={p.ratingAvg} /> <b className="text-fg">{p.ratingAvg ? p.ratingAvg.toFixed(1) : '–'}</b> ({num(p.ratingCount)} đánh giá)</span>
            <span>Đã bán <b className="text-fg">{num(p.soldCount)}</b></span>
            {p.deliveryType === 'AUTO' ? (
              <Badge tone="success"><Zap className="h-3 w-3" /> Giao tự động</Badge>
            ) : (
              <Badge tone="info"><Truck className="h-3 w-3" /> Hoàn thành trong {hoursLabel(p.serviceSlaHours ?? 24)}</Badge>
            )}
          </div>

          <Card className="mt-4 p-4">
            <p className="mb-2 text-sm font-medium text-fg2">Chọn gói</p>
            <div className="flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { setVariantId(v.id); setQty(v.minQty); }}
                  className={cn('rounded-xl border px-3.5 py-2 text-left text-sm transition', v.id === variantId ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/50', p.deliveryType === 'AUTO' && (v.available ?? 0) < v.minQty && 'opacity-50')}
                >
                  <span className="block font-medium">{v.name}</span>
                  <span className="font-bold text-primary">{vnd(v.price)}</span>
                  {v.compareAtPrice && <span className="ml-1.5 text-xs text-muted line-through">{vnd(v.compareAtPrice)}</span>}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-fg2">Số lượng</span>
              <div className="flex items-center rounded-lg border border-border">
                <button type="button" className="p-2 text-muted hover:text-fg disabled:opacity-40" disabled={qty <= (variant?.minQty ?? 1)} onClick={() => setQty((q) => q - 1)} aria-label="Giảm"><Minus className="h-4 w-4" /></button>
                <input value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 1)))} className="w-14 bg-transparent text-center text-sm font-semibold tabular outline-none" aria-label="Số lượng" />
                <button type="button" className="p-2 text-muted hover:text-fg disabled:opacity-40" disabled={qty >= max} onClick={() => setQty((q) => q + 1)} aria-label="Tăng"><Plus className="h-4 w-4" /></button>
              </div>
              {p.deliveryType === 'AUTO' && <span className="text-sm text-muted">Còn <b className={cn('tabular', (variant?.available ?? 0) < 20 ? 'text-warning' : 'text-fg')}>{num(variant?.available ?? 0)}</b> {variant && variant.unitsPerPurchase > 1 ? 'lô' : 'sản phẩm'}</span>}
            </div>
            {p.deliveryType === 'MANUAL' && p.buyerInputLabel && (
              <div className="mt-4">
                <Field label="Thông tin bạn cần cung cấp" hint={p.buyerInputLabel} required>
                  {(id) => <Textarea id={id} value={buyerInput} onChange={(e) => setBuyerInput(e.target.value)} maxLength={2000} placeholder={p.buyerInputLabel ?? ''} />}
                </Field>
              </div>
            )}
            <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
              <div>
                <span className="text-sm text-muted">Tổng thanh toán</span>
                <p className="text-2xl font-bold text-primary tabular">{vnd(total)}</p>
                {me?.user && wallet && <p className="text-xs text-muted">Số dư: {vnd(wallet.available)}</p>}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={buy} loading={buying} disabled={out || isOwner || p.store.status !== 'ACTIVE' || (p.deliveryType === 'MANUAL' && !!p.buyerInputLabel && !buyerInput.trim())}>
                {out ? 'Hết hàng' : isOwner ? 'Sản phẩm của bạn' : p.store.status === 'VACATION' ? 'Gian hàng đang nghỉ' : 'Mua ngay'}
              </Button>
              <Button size="lg" variant="outline" onClick={chat} disabled={isOwner}>
                <MessageCircle className="h-5 w-5" /> Nhắn người bán
              </Button>
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-success-soft p-3 text-[13px] text-success">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Tiền được sàn giữ trong ký quỹ {p.warrantyHours > 0 ? `và bảo hành ${hoursLabel(p.warrantyHours)}` : ''}. Hàng lỗi được đổi mới hoặc hoàn tiền; người bán không phản hồi khiếu nại sẽ bị tự động hoàn tiền.</span>
            </div>
          </Card>

          <Card className="mt-4 flex flex-wrap items-center gap-4 p-4">
            <Avatar src={p.store.avatarUrl} name={p.store.name} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/shop/${p.store.slug}`} className="font-semibold hover:text-primary">{p.store.name}</Link>
                <LevelBadge level={p.store.level} />
                <span className={cn('text-xs', p.store.online ? 'text-success' : 'text-muted')}>● {p.store.online ? 'Đang online' : 'Offline'}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">⭐ {p.store.ratingAvg.toFixed(1)} · {num(p.store.completedOrders)} đơn hoàn tất · Khiếu nại {p.store.disputeRatePct}% · Tham gia {dateOnly(p.store.createdAt)}</p>
            </div>
            <Link href={`/shop/${p.store.slug}`}><Button variant="outline" size="sm"><Store className="h-4 w-4" /> Xem shop</Button></Link>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <Tabs value={tab} onChange={setTab} className="px-3" items={[{ value: 'desc', label: 'Mô tả' }, { value: 'specs', label: 'Thông số' }, { value: 'policy', label: 'Bảo hành & ký quỹ' }, { value: 'reviews', label: 'Đánh giá', count: p.ratingCount }]} />
        <div className="p-5">
          {tab === 'desc' && <div className="prose-mmo max-w-3xl text-sm text-fg2" dangerouslySetInnerHTML={{ __html: p.descriptionHtml }} />}
          {tab === 'specs' && (
            <dl className="grid max-w-2xl gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-border py-2"><dt className="text-muted">Kiểu giao hàng</dt><dd className="font-medium">{p.deliveryType === 'AUTO' ? 'Tự động' : 'Thủ công'}</dd></div>
              <div className="flex justify-between border-b border-border py-2"><dt className="text-muted">Bảo hành</dt><dd className="font-medium">{hoursLabel(p.warrantyHours)}</dd></div>
              {p.attributes.map((a) => (
                <div key={a.key} className="flex justify-between border-b border-border py-2"><dt className="text-muted">{a.label}</dt><dd className="font-medium">{a.display}</dd></div>
              ))}
            </dl>
          )}
          {tab === 'policy' && (
            <ul className="max-w-3xl space-y-3 text-sm text-fg2">
              <li className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-success" />Tiền của bạn được giữ trong ký quỹ, chỉ chuyển cho người bán sau {hoursLabel(p.warrantyHours)} nếu không có khiếu nại.</li>
              <li className="flex gap-2"><Clock className="h-5 w-5 shrink-0 text-primary" />Trong thời gian bảo hành, bấm “Báo lỗi” trong đơn hàng để khiếu nại từng item. Người bán có 12 giờ để đổi hoặc hoàn tiền.</li>
              <li className="flex gap-2"><Lock className="h-5 w-5 shrink-0 text-warning" />Không giao dịch ngoài sàn – giao dịch ngoài sàn không được bảo vệ.</li>
            </ul>
          )}
          {tab === 'reviews' && <Reviews productId={p.id} dist={p.ratingDistribution} total={p.ratingCount} />}
        </div>
      </Card>
      <div className="mt-3 flex justify-end"><ReportButton targetType="PRODUCT" targetId={p.id} /></div>
      <DepositModal open={deposit != null} onClose={() => setDeposit(null)} suggest={deposit ?? undefined} />
    </div>
  );
}
