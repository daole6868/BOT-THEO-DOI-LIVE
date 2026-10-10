'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

/** Menu thả xuống đơn giản: đóng khi bấm ra ngoài hoặc nhấn Esc. */
export function Dropdown({ trigger, children, align = 'right', className, panelClassName }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string; panelClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className={cn('absolute z-50 mt-2 min-w-[220px] rounded-xl border border-border bg-card p-1.5 shadow-xl', align === 'right' ? 'right-0' : 'left-0', panelClassName)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger, icon }: { children: ReactNode; onClick?: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle', danger ? 'text-danger' : 'text-fg2 hover:text-fg')}>
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  );
}
