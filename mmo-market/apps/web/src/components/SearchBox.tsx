'use client';
import { useQuery } from '@tanstack/react-query';
import { shortVnd } from '@mmo/ui';
import { Search, Store, Tag } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => api<{ products: any[]; stores: any[]; categories: any[] }>(`/search/suggest?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const submit = () => {
    setOpen(false);
    router.push(`/tim-kiem?q=${encodeURIComponent(q.trim())}`);
  };
  const has = data && (data.products.length || data.stores.length || data.categories.length);
  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        role="search"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm tài khoản, tool, proxy, key, dịch vụ…"
          className="h-10 w-full rounded-xl border border-border bg-subtle pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
          aria-label="Tìm kiếm"
        />
      </form>
      {open && debounced.length >= 2 && has ? (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          {data!.categories.map((c) => (
            <Link key={c.slug} href={`/danh-muc/${c.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-subtle">
              <Tag className="h-4 w-4 text-muted" /> Danh mục: <b>{c.name}</b>
            </Link>
          ))}
          {data!.stores.map((s) => (
            <Link key={s.slug} href={`/shop/${s.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-subtle">
              <Store className="h-4 w-4 text-muted" /> Gian hàng: <b>{s.name}</b>
            </Link>
          ))}
          {data!.products.map((p) => (
            <Link key={p.id} href={`/san-pham/${p.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.image ? <img src={p.image} alt="" className="h-8 w-10 rounded object-cover" /> : <span className="h-8 w-10 rounded bg-subtle" />}
              <span className="flex-1 truncate">{p.title}</span>
              <span className="text-xs font-semibold text-primary">{shortVnd(p.priceMin)}</span>
            </Link>
          ))}
          <button type="button" onClick={submit} className="w-full border-t border-border px-4 py-2 text-left text-sm text-primary hover:bg-subtle">
            Xem tất cả kết quả cho “{q}”
          </button>
        </div>
      ) : null}
    </div>
  );
}
