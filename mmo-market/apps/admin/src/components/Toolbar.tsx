'use client';
import { Input, cn } from '@mmo/ui';
import { Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** Ô tìm kiếm có debounce. */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => v !== value && onChange(v), 350);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="h-9 pl-9" aria-label={placeholder} />
    </div>
  );
}

/** Nhóm nút lọc dạng chip, chọn 1. */
export function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          aria-pressed={value === i.value}
          onClick={() => onChange(i.value)}
          className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', value === i.value ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg2 hover:bg-subtle')}
        >
          {i.label}
          {i.count != null && <span className="rounded-full bg-subtle px-1.5 tabular text-[10px]">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}
