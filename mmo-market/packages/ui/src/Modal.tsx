'use client';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, children, footer, size = 'md', dismissable = true }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; dismissable?: boolean }) {
  useLockScroll(open);
  useEscape(open && dismissable, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => dismissable && onClose()} />
      <div ref={ref} className={cn('relative w-full rounded-t-2xl sm:rounded-2xl bg-card border border-border shadow-2xl max-h-[92vh] flex flex-col', w)}>
        {(title || dismissable) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {dismissable && (
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Đóng">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Ngăn kéo: từ phải (desktop) hoặc từ dưới (mobile bộ lọc). */
export function Sheet({ open, onClose, title, children, footer, side = 'right' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'right' | 'bottom' | 'left' }) {
  useLockScroll(open);
  useEscape(open, onClose);
  if (!open || typeof document === 'undefined') return null;
  const pos = side === 'bottom' ? 'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl' : side === 'left' ? 'inset-y-0 left-0 w-[86vw] max-w-sm' : 'inset-y-0 right-0 w-[92vw] max-w-md';
  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div className={cn('absolute bg-card border-border shadow-2xl flex flex-col', pos)}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
