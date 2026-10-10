import { LevelBadge, num, shortVnd, timeAgo } from '@mmo/ui';
import { ArrowRight, BadgeCheck, Clock, Headset, Lock, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { ProductCard, type ProductCardData } from '@/components/ProductCard';
import { CategoryIcon } from '@/lib/icons';
import { serverApi } from '@/lib/server';

interface HomeData {
  announcement: string;
  categories: { id: string; slug: string; name: string; icon: string; productCount: number; description: string; children: { id: string; slug: string; name: string }[] }[];
  bestSellers: ProductCardData[];
  newest: ProductCardData[];
  posts: { id: string; title: string; budgetMin: number | null; budgetMax: number | null; quantity: number | null; offerCount: number; commentCount: number; deadlineAt: string; createdAt: string }[];
  topStores: { slug: string; name: string; avatarUrl: string | null; level: string; ratingAvg: number; ratingCount: number; completedOrders: number }[];
  stats: { products: number; stores: number; completedOrders: number };
}

export default async function HomePage() {
  const data = await serverApi<HomeData>('/home');
  if (!data) {
    return <div className="container-page py-24 text-center text-muted">Không kết nối được máy chủ API. Hãy chắc chắn API đang chạy (npm run dev).</div>;
  }
  return (
    <div className="container-page space-y-12 py-6">
      {data.announcement && <div className="rounded-xl border border-primary/20 bg-primary-soft px-4 py-2.5 text-sm text-primary">{data.announcement}</div>}

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#4f46e5] via-[#4338ca] to-[#0891b2] p-6 text-white sm:p-10">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-white/5" />
          <p className="relative text-sm font-medium text-white/80">Sàn giao dịch sản phẩm MMO</p>
          <h1 className="relative mt-2 max-w-xl text-2xl font-bold leading-tight sm:text-4xl">Mua bán tài khoản, tool, proxy & dịch vụ – tiền luôn được giữ an toàn</h1>
          <p className="relative mt-3 max-w-lg text-sm text-white/85 sm:text-base">Thanh toán vào ký quỹ, nhận hàng tự động trong vài giây, lỗi được đổi hoặc hoàn tiền trong thời gian bảo hành.</p>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <Link href="/tim-kiem" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#4338ca] hover:bg-white/90">
              Khám phá sản phẩm <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/yeu-cau/moi" className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              Đăng yêu cầu tìm hàng
            </Link>
          </div>
          <div className="relative mt-8 flex flex-wrap gap-6 text-sm">
            <span><b className="text-lg">{num(data.stats.products)}</b> <span className="text-white/75">sản phẩm</span></span>
            <span><b className="text-lg">{num(data.stats.stores)}</b> <span className="text-white/75">gian hàng</span></span>
            <span><b className="text-lg">{num(data.stats.completedOrders)}</b> <span className="text-white/75">đơn hoàn tất</span></span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 font-semibold">Bảo vệ người mua</p>
          <ul className="space-y-3 text-sm">
            {[
              [Lock, 'Ký quỹ (escrow)', 'Tiền chỉ chuyển cho người bán khi hết bảo hành'],
              [Zap, 'Giao hàng tự động', 'Nhận tài khoản/key ngay sau khi thanh toán'],
              [ShieldCheck, 'Khiếu nại 1 chạm', 'Người bán không phản hồi → tự hoàn tiền'],
              [BadgeCheck, 'Người bán đã xác minh', 'KYC danh tính, xếp hạng uy tín rõ ràng'],
              [Headset, 'Hỗ trợ trực tuyến', 'Chat với hỗ trợ viên ngay trên sàn'],
            ].map(([Icon, t, d]: any) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-medium text-fg">{t}</span>
                  <span className="text-xs text-muted">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Danh mục nổi bật</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.categories.map((c) => (
            <Link key={c.id} href={`/danh-muc/${c.slug}`} className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-primary-fg">
                <CategoryIcon name={c.icon} className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-fg">{c.name}</p>
              <p className="text-xs text-muted">{num(c.productCount)} sản phẩm</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">🔥 Bán chạy</h2>
          <Link href="/tim-kiem?sort=best_selling" className="text-sm text-primary hover:underline">Xem tất cả →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.bestSellers.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">📝 Yêu cầu mới từ người mua</h2>
            <Link href="/yeu-cau" className="text-sm text-primary hover:underline">Vào chợ yêu cầu →</Link>
          </div>
          <div className="space-y-2.5">
            {data.posts.map((p) => (
              <Link key={p.id} href={`/yeu-cau/${p.id}`} className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/40">
                <p className="font-medium text-fg">{p.title}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {(p.budgetMin || p.budgetMax) && <span className="font-semibold text-success">💰 {shortVnd(p.budgetMin)} – {shortVnd(p.budgetMax)}</span>}
                  {p.quantity && <span>SL: {num(p.quantity)}</span>}
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{p.commentCount} bình luận</span>
                  <span>📨 {p.offerCount} báo giá</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(p.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-4 text-lg font-bold">🏆 Gian hàng uy tín</h2>
          <div className="space-y-2.5">
            {data.topStores.map((s) => (
              <Link key={s.slug} href={`/shop/${s.slug}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="h-11 w-11 rounded-full bg-subtle" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <LevelBadge level={s.level} />
                  </span>
                  <span className="text-xs text-muted">⭐ {s.ratingAvg.toFixed(1)} · {num(s.completedOrders)} đơn hoàn tất</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">✨ Mới đăng bán</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.newest.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
