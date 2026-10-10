import { LevelBadge, num, Stars, vnd } from '@mmo/ui';
import { ShieldCheck, Zap, Hand } from 'lucide-react';
import Link from 'next/link';

export interface ProductCardData {
  id: string;
  title: string;
  image: string | null;
  priceMin: number;
  deliveryType: 'AUTO' | 'MANUAL';
  stockTotal: number;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  warrantyHours: number;
  store: { slug: string; name: string; level: string };
}

export function DeliveryTag({ type }: { type: string }) {
  return type === 'AUTO' ? (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">
      <Zap className="h-3 w-3" /> Tự động
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-info-soft px-1.5 py-0.5 text-[11px] font-semibold text-info">
      <Hand className="h-3 w-3" /> Thủ công
    </span>
  );
}

function Thumb({ src, title }: { src: string | null; title: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-subtle" />;
}

export function ProductCard({ p }: { p: ProductCardData }) {
  const out = p.deliveryType === 'AUTO' && p.stockTotal <= 0;
  return (
    <Link href={`/san-pham/${p.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-subtle">
        <Thumb src={p.image} title={p.title} />
        <div className="absolute left-2 top-2">
          <DeliveryTag type={p.deliveryType} />
        </div>
        {out && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-sm font-semibold text-white">Hết hàng</div>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-medium leading-snug text-fg group-hover:text-primary">{p.title}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Stars value={p.ratingAvg} size={12} />
          <span className="tabular">{p.ratingAvg ? p.ratingAvg.toFixed(1) : '–'}</span>
          <span>·</span>
          <span>Đã bán {num(p.soldCount)}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            <span className="text-[11px] text-muted">từ </span>
            <span className="text-base font-bold text-primary">{vnd(p.priceMin)}</span>
          </div>
          {p.deliveryType === 'AUTO' && <span className="text-[11px] text-muted">Còn {num(p.stockTotal)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
          <span className="truncate text-fg2">{p.store.name}</span>
          <LevelBadge level={p.store.level} />
        </div>
      </div>
    </Link>
  );
}

/** Dạng danh sách: phù hợp hàng tài khoản cần so sánh nhiều thông số. */
export function ProductRow({ p, attrs }: { p: ProductCardData & { attrs?: Record<string, unknown> }; attrs?: { key: string; label: string; options?: { value: string; label: string }[]; type: string; unit?: string | null }[] }) {
  const show = (attrs ?? [])
    .filter((a) => p.attrs && p.attrs[a.key] !== undefined)
    .slice(0, 4)
    .map((a) => {
      const v = p.attrs![a.key];
      if (a.type === 'BOOLEAN') return v ? `${a.label} ✓` : null;
      if (Array.isArray(v)) return v.map((x) => a.options?.find((o) => o.value === x)?.label ?? x).join(', ');
      return a.options?.find((o) => o.value === v)?.label ?? `${v}${a.unit ? ' ' + a.unit : ''}`;
    })
    .filter(Boolean);
  return (
    <Link href={`/san-pham/${p.id}`} className="group flex gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm">
      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-subtle sm:h-24 sm:w-32">
        <Thumb src={p.image} title={p.title} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <DeliveryTag type={p.deliveryType} />
          {p.warrantyHours > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted">
              <ShieldCheck className="h-3 w-3" /> BH {p.warrantyHours % 24 === 0 ? `${p.warrantyHours / 24} ngày` : `${p.warrantyHours}h`}
            </span>
          )}
        </div>
        <h3 className="mt-1 line-clamp-1 font-medium text-fg group-hover:text-primary">{p.title}</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="text-fg2">{p.store.name}</span>
          <LevelBadge level={p.store.level} />
          <span>
            ⭐ {p.ratingAvg ? p.ratingAvg.toFixed(1) : '–'} ({num(p.ratingCount)})
          </span>
          <span>· Đã bán {num(p.soldCount)}</span>
          {p.deliveryType === 'AUTO' && <span>· Còn {num(p.stockTotal)}</span>}
        </div>
        {show.length > 0 && <p className="mt-1 truncate text-xs text-fg2">{show.join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between">
        <span className="text-right">
          <span className="block text-[11px] text-muted">từ</span>
          <span className="text-base font-bold text-primary">{vnd(p.priceMin)}</span>
        </span>
        <span className="hidden rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg sm:block">Mua</span>
      </div>
    </Link>
  );
}
