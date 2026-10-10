'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Checkbox, EmptyState, LEVELS, Pagination, Select, Sheet, Skeleton, Switch, cn, num, shortVnd } from '@mmo/ui';
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ProductCard, ProductRow } from './ProductCard';

interface AttrFacet {
  key: string;
  label: string;
  type: 'SELECT' | 'MULTISELECT' | 'NUMBER' | 'BOOLEAN' | 'TEXT';
  unit?: string | null;
  options: { value: string; label: string; count?: number }[];
  counts?: Record<string, number>;
  range?: { min: number | null; max: number | null };
}
interface SearchResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  category: null | { name: string; slug: string; description: string | null; breadcrumbs: { slug: string; name: string }[] };
  facets: {
    categories: { id: string; slug: string; name: string; count: number }[];
    delivery: Record<string, number>;
    levels: Record<string, number>;
    price: { min: number | null; max: number | null };
    attributes: AttrFacet[];
  };
}

const SORTS = [
  ['best_selling', 'Bán chạy'],
  ['relevance', 'Phù hợp nhất'],
  ['newest', 'Mới nhất'],
  ['price_asc', 'Giá tăng dần'],
  ['price_desc', 'Giá giảm dần'],
  ['rating', 'Đánh giá cao'],
];
const PRICE_PRESETS: [string, number | null, number | null][] = [
  ['Dưới 20K', null, 20000],
  ['20K – 100K', 20000, 100000],
  ['100K – 500K', 100000, 500000],
  ['Trên 500K', 500000, null],
];

function Group({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border py-3.5 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-sm font-semibold text-fg">
        {title}
        <span className="text-muted">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function OptionList({ options, selected, onToggle }: { options: { value: string; label: string; count?: number }[]; selected: string[]; onToggle: (v: string) => void }) {
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState('');
  const list = options.filter((o) => !filter || o.label.toLowerCase().includes(filter.toLowerCase()));
  const shown = more ? list : list.slice(0, 6);
  return (
    <div>
      {options.length > 10 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Tìm…" className="mb-2 h-8 w-full rounded-md border border-border bg-card px-2 text-xs" />}
      {shown.map((o) => (
        <Checkbox key={o.value} checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} label={o.label} count={o.count} disabled={o.count === 0 && !selected.includes(o.value)} />
      ))}
      {list.length > 6 && (
        <button type="button" onClick={() => setMore(!more)} className="mt-1 text-xs text-primary hover:underline">
          {more ? 'Thu gọn' : `Xem thêm ${list.length - 6}`}
        </button>
      )}
    </div>
  );
}

function RangeInputs({ min, max, placeholderMin, placeholderMax, onApply, unit }: { min?: string | null; max?: string | null; placeholderMin?: string; placeholderMax?: string; onApply: (min: string, max: string) => void; unit?: string }) {
  const [a, setA] = useState(min ?? '');
  const [b, setB] = useState(max ?? '');
  useEffect(() => {
    setA(min ?? '');
    setB(max ?? '');
  }, [min, max]);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(a, b);
      }}
    >
      <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/[^\d.]/g, ''))} onBlur={() => onApply(a, b)} placeholder={placeholderMin ?? 'Từ'} className="h-9 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-sm" aria-label="Giá trị tối thiểu" />
      <span className="text-muted">–</span>
      <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/[^\d.]/g, ''))} onBlur={() => onApply(a, b)} placeholder={placeholderMax ?? 'Đến'} className="h-9 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-sm" aria-label="Giá trị tối đa" />
      {unit && <span className="text-xs text-muted">{unit}</span>}
    </form>
  );
}

export function ProductBrowser({ category }: { category?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const view = params.get('view') === 'list' ? 'list' : params.get('view') === 'grid' ? 'grid' : category?.startsWith('tai-khoan') ? 'list' : 'grid';

  const queryString = useMemo(() => {
    const p = new URLSearchParams(params.toString());
    p.delete('view');
    if (category) p.set('category', category);
    return p.toString();
  }, [params, category]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', queryString],
    queryFn: () => api<SearchResult>(`/search/products?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const update = (fn: (p: URLSearchParams) => void, resetPage = true) => {
    const p = new URLSearchParams(params.toString());
    fn(p);
    if (resetPage) p.delete('page');
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const listParam = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean);
  const toggleIn = (key: string, v: string) =>
    update((p) => {
      const cur = (p.get(key) ?? '').split(',').filter(Boolean);
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      if (next.length) p.set(key, next.join(','));
      else p.delete(key);
    });

  const f = data?.facets;
  const chips: { label: string; remove: () => void }[] = [];
  if (params.get('q')) chips.push({ label: `“${params.get('q')}”`, remove: () => update((p) => p.delete('q')) });
  if (params.get('priceMin') || params.get('priceMax'))
    chips.push({ label: `Giá ${params.get('priceMin') ? shortVnd(Number(params.get('priceMin'))) : '0'} – ${params.get('priceMax') ? shortVnd(Number(params.get('priceMax'))) : '∞'}`, remove: () => update((p) => (p.delete('priceMin'), p.delete('priceMax'))) });
  if (params.get('delivery')) chips.push({ label: params.get('delivery') === 'AUTO' ? 'Giao tự động' : 'Giao thủ công', remove: () => update((p) => p.delete('delivery')) });
  if (params.get('inStock')) chips.push({ label: 'Còn hàng', remove: () => update((p) => p.delete('inStock')) });
  if (params.get('ratingMin')) chips.push({ label: `Từ ${params.get('ratingMin')}★`, remove: () => update((p) => p.delete('ratingMin')) });
  if (params.get('warrantyMin')) chips.push({ label: `Bảo hành ≥ ${params.get('warrantyMin')}h`, remove: () => update((p) => p.delete('warrantyMin')) });
  for (const l of listParam('levels')) chips.push({ label: `Cấp ${LEVELS[l]?.label ?? l}`, remove: () => toggleIn('levels', l) });
  for (const a of f?.attributes ?? []) {
    const raw = params.get(`a.${a.key}`);
    if (!raw) continue;
    if (a.type === 'BOOLEAN') chips.push({ label: `${a.label}: ${raw === 'true' ? 'Có' : 'Không'}`, remove: () => update((p) => p.delete(`a.${a.key}`)) });
    else if (a.type === 'NUMBER') chips.push({ label: `${a.label}: ${raw.replace('~', ' – ')}`, remove: () => update((p) => p.delete(`a.${a.key}`)) });
    else for (const v of raw.split(',')) chips.push({ label: `${a.label}: ${a.options.find((o) => o.value === v)?.label ?? v}`, remove: () => toggleIn(`a.${a.key}`, v) });
  }

  const panel = (
    <div>
      {f && f.categories.length > 0 && (
        <Group title={category ? 'Danh mục con' : 'Danh mục'}>
          <ul className="space-y-0.5">
            {f.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/danh-muc/${c.slug}`} className="flex justify-between rounded-md px-1.5 py-1 text-sm text-fg2 hover:bg-subtle hover:text-fg">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted tabular">{num(c.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      )}
      <Group title="Khoảng giá">
        <RangeInputs
          min={params.get('priceMin')}
          max={params.get('priceMax')}
          placeholderMin={f?.price.min != null ? shortVnd(f.price.min) : 'Từ'}
          placeholderMax={f?.price.max != null ? shortVnd(f.price.max) : 'Đến'}
          onApply={(a, b) => update((p) => {
            if (a) p.set('priceMin', a); else p.delete('priceMin');
            if (b) p.set('priceMax', b); else p.delete('priceMax');
          })}
          unit="₫"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map(([label, a, b]) => {
            const active = (params.get('priceMin') ?? '') === (a?.toString() ?? '') && (params.get('priceMax') ?? '') === (b?.toString() ?? '');
            return (
              <button key={label} type="button" onClick={() => update((p) => { if (a) p.set('priceMin', String(a)); else p.delete('priceMin'); if (b) p.set('priceMax', String(b)); else p.delete('priceMax'); })} className={cn('rounded-full border px-2.5 py-1 text-xs', active ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg2 hover:border-primary/50')}>
                {label}
              </button>
            );
          })}
        </div>
      </Group>
      <Group title="Kiểu giao hàng">
        <Checkbox checked={params.get('delivery') === 'AUTO'} onChange={(v) => update((p) => (v ? p.set('delivery', 'AUTO') : p.delete('delivery')))} label="⚡ Tự động (nhận ngay)" count={f?.delivery.AUTO ?? 0} />
        <Checkbox checked={params.get('delivery') === 'MANUAL'} onChange={(v) => update((p) => (v ? p.set('delivery', 'MANUAL') : p.delete('delivery')))} label="👤 Thủ công / dịch vụ" count={f?.delivery.MANUAL ?? 0} />
        <div className="mt-2">
          <Switch checked={!!params.get('inStock')} onChange={(v) => update((p) => (v ? p.set('inStock', '1') : p.delete('inStock')))} label="Chỉ hiện còn hàng" />
        </div>
      </Group>
      {f?.attributes.map((a) => {
        const raw = params.get(`a.${a.key}`);
        if (a.type === 'BOOLEAN') {
          return (
            <Group key={a.key} title={a.label}>
              <Switch checked={raw === 'true'} onChange={(v) => update((p) => (v ? p.set(`a.${a.key}`, 'true') : p.delete(`a.${a.key}`)))} label={`Có (${num(a.counts?.true ?? 0)})`} />
            </Group>
          );
        }
        if (a.type === 'NUMBER') {
          const [mn, mx] = (raw ?? '~').split('~');
          return (
            <Group key={a.key} title={a.label}>
              <RangeInputs min={mn || null} max={mx || null} placeholderMin={a.range?.min != null ? String(a.range.min) : 'Từ'} placeholderMax={a.range?.max != null ? String(a.range.max) : 'Đến'} unit={a.unit ?? undefined} onApply={(x, y) => update((p) => (x || y ? p.set(`a.${a.key}`, `${x}~${y}`) : p.delete(`a.${a.key}`)))} />
            </Group>
          );
        }
        if (a.type === 'TEXT') return null;
        return (
          <Group key={a.key} title={a.label}>
            <OptionList options={a.options} selected={(raw ?? '').split(',').filter(Boolean)} onToggle={(v) => toggleIn(`a.${a.key}`, v)} />
          </Group>
        );
      })}
      <Group title="Đánh giá">
        {[5, 4, 3].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-fg2">
            <input type="radio" name="rating" className="accent-[var(--primary)]" checked={params.get('ratingMin') === String(r)} onChange={() => update((p) => p.set('ratingMin', String(r)))} />
            {'⭐'.repeat(r)} {r < 5 && 'trở lên'}
          </label>
        ))}
        {params.get('ratingMin') && (
          <button type="button" className="text-xs text-primary" onClick={() => update((p) => p.delete('ratingMin'))}>
            Bỏ lọc đánh giá
          </button>
        )}
      </Group>
      <Group title="Cấp gian hàng">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LEVELS).map(([k, l]) => (
            <button key={k} type="button" onClick={() => toggleIn('levels', k)} className={cn('rounded-full border px-2.5 py-1 text-xs', listParam('levels').includes(k) ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg2 hover:border-primary/50')}>
              {l.icon} {l.label} <span className="text-muted">({f?.levels[k] ?? 0})</span>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Bảo hành tối thiểu" defaultOpen={false}>
        <Select value={params.get('warrantyMin') ?? ''} onChange={(e) => update((p) => (e.target.value ? p.set('warrantyMin', e.target.value) : p.delete('warrantyMin')))}>
          <option value="">Bất kỳ</option>
          <option value="24">≥ 24 giờ</option>
          <option value="48">≥ 48 giờ</option>
          <option value="72">≥ 3 ngày</option>
          <option value="168">≥ 7 ngày</option>
          <option value="720">≥ 30 ngày</option>
        </Select>
      </Group>
    </div>
  );

  const title = data?.category?.name ?? (params.get('q') ? `Kết quả cho “${params.get('q')}”` : 'Tất cả sản phẩm');
  return (
    <div className="container-page py-6">
      <nav className="mb-2 text-xs text-muted">
        <Link href="/" className="hover:text-fg">Trang chủ</Link>
        {data?.category?.breadcrumbs.map((b) => (
          <span key={b.slug}>
            {' › '}
            <Link href={`/danh-muc/${b.slug}`} className="hover:text-fg">{b.name}</Link>
          </span>
        ))}
      </nav>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {data?.category?.description && <p className="text-sm text-muted">{data.category.description}</p>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[264px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-border bg-card px-4 py-1">
            <div className="flex items-center justify-between pt-3 text-sm font-bold uppercase tracking-wide text-muted">
              Bộ lọc
              {chips.length > 0 && (
                <button type="button" className="text-xs font-medium normal-case text-primary" onClick={() => router.replace(params.get('q') ? `${pathname}?q=${encodeURIComponent(params.get('q')!)}` : pathname, { scroll: false })}>
                  Xoá hết
                </button>
              )}
            </div>
            {panel}
          </div>
        </aside>
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Bộ lọc{chips.length ? ` (${chips.length})` : ''}
            </Button>
            <span className="text-sm text-muted">
              <b className="text-fg tabular">{num(data?.total ?? 0)}</b> kết quả {isFetching && !isLoading && <span className="ml-1 animate-pulse">· đang cập nhật…</span>}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Select value={params.get('sort') ?? data?.sort ?? 'best_selling'} onChange={(e) => update((p) => p.set('sort', e.target.value))} className="h-9 w-auto text-sm" aria-label="Sắp xếp">
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              <div className="hidden rounded-lg border border-border p-0.5 sm:flex">
                <button type="button" onClick={() => update((p) => p.set('view', 'grid'), false)} className={cn('rounded-md p-1.5', view === 'grid' ? 'bg-subtle text-fg' : 'text-muted')} aria-label="Dạng lưới">
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => update((p) => p.set('view', 'list'), false)} className={cn('rounded-md p-1.5', view === 'list' ? 'bg-subtle text-fg' : 'text-muted')} aria-label="Dạng danh sách">
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft/70">
                  {c.label} <X className="h-3.5 w-3.5" />
                </button>
              ))}
              <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => router.replace(pathname, { scroll: false })}>
                Xoá tất cả
              </button>
            </div>
          )}
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-72" />
              ))}
            </div>
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-border bg-card">
              <EmptyState title="Không có sản phẩm phù hợp" description="Thử bỏ bớt bộ lọc hoặc đăng yêu cầu để người bán tìm đến bạn." action={<Link href="/yeu-cau/moi"><Button variant="secondary">Đăng yêu cầu tìm hàng</Button></Link>} />
            </div>
          ) : view === 'list' ? (
            <div className={cn('space-y-2.5 transition-opacity', isFetching && 'opacity-70')}>
              {data.items.map((p) => (
                <ProductRow key={p.id} p={p} attrs={data.facets.attributes} />
              ))}
            </div>
          ) : (
            <div className={cn('grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 xl:grid-cols-4', isFetching && 'opacity-70')}>
              {data.items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
          {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(pg) => update((p) => p.set('page', String(pg)), false)} />}
        </section>
      </div>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Bộ lọc" side="bottom" footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => router.replace(pathname, { scroll: false })}>Xoá hết</Button><Button className="flex-[2]" onClick={() => setMobileOpen(false)}>Xem {num(data?.total ?? 0)} kết quả</Button></div>}>
        {panel}
      </Sheet>
    </div>
  );
}
