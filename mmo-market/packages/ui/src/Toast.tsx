'use client';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}
interface ToastApi {
  show: (kind: ToastKind, title: string, body?: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const show = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq;
    setItems((xs) => [...xs.slice(-3), { id, kind, title, body }]);
    setTimeout(() => remove(id), kind === 'error' ? 7000 : 4500);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (t, b) => show('success', t, b),
      error: (t, b) => show('error', t, b),
      info: (t, b) => show('info', t, b),
      warning: (t, b) => show('warning', t, b),
    }),
    [show],
  );
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
  const colors = { success: 'text-success', error: 'text-danger', info: 'text-info', warning: 'text-warning' };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[200] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {items.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 shadow-lg">
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', colors[t.kind])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs text-muted break-words">{t.body}</p>}
              </div>
              <button type="button" onClick={() => remove(t.id)} className="text-muted hover:text-fg" aria-label="Đóng thông báo">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast phải nằm trong ToastProvider');
  return v;
}
