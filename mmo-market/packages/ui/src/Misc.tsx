'use client';
import { Check, ChevronLeft, ChevronRight, Copy, Inbox, Star } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { remaining } from './format';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary', className)} aria-label="Đang tải" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-subtle', className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-subtle text-muted">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ src, name, size = 36, className }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const letter = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? ''} width={size} height={size} className={cn('rounded-full object-cover bg-subtle shrink-0', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn('inline-flex items-center justify-center rounded-full bg-primary-soft text-primary font-semibold shrink-0', className)} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {letter}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-none', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            'relative -mb-px whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors border-b-2',
            value === it.value ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {it.label}
          {it.count != null && <span className={cn('ml-1.5 rounded-full px-1.5 py-px text-[11px] tabular', value === it.value ? 'bg-primary-soft' : 'bg-subtle')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const btn = 'h-8 min-w-8 px-2 rounded-lg text-sm tabular';
  return (
    <nav className="flex items-center justify-center gap-1 py-3" aria-label="Phân trang">
      <button type="button" className={cn(btn, 'hover:bg-subtle disabled:opacity-40')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
        <ChevronLeft className="h-4 w-4 mx-auto" />
      </button>
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button key={n} type="button" onClick={() => onChange(n)} className={cn(btn, n === page ? 'bg-primary text-primary-fg' : 'hover:bg-subtle')} aria-current={n === page ? 'page' : undefined}>
            {n}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, 'hover:bg-subtle disabled:opacity-40')} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau">
        <ChevronRight className="h-4 w-4 mx-auto" />
      </button>
    </nav>
  );
}

export function CopyButton({ text, label = 'Sao chép', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-subtle hover:text-fg', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* trình duyệt chặn clipboard */
        }
      }}
      aria-label={label}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Đã chép' : label}
    </button>
  );
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-border'} />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Chọn số sao">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)} className="p-0.5">
          <Star className={cn('h-7 w-7 transition', i <= value ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-border hover:text-[#f59e0b]')} />
        </button>
      ))}
    </div>
  );
}

/** Đồng hồ đếm ngược tới hạn chót. */
export function Countdown({ to, className, expiredText = 'đã hết hạn' }: { to: string | Date; className?: string; expiredText?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(to).getTime() - now;
  return <span className={cn('tabular', className)}>{ms <= 0 ? expiredText : remaining(ms)}</span>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function TH({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return <th className={cn('whitespace-nowrap border-b border-border bg-subtle/60 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</th>;
}
export function TD({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return <td className={cn('border-b border-border px-4 py-3 align-middle', align === 'right' && 'text-right tabular', align === 'center' && 'text-center', className)}>{children}</td>;
}
