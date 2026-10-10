import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const base =
  'w-full rounded-lg border border-border bg-card px-3 text-sm text-fg placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(base, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(base, 'py-2 min-h-[96px] leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(base, 'h-10 pr-8 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-[13px] font-medium text-fg2 mb-1.5', className)}>
      {children}
    </label>
  );
}

/** Trường nhập có nhãn, gợi ý và lỗi. children nhận id để gắn nhãn đúng (a11y). */
export function Field({ label, hint, error, children, required, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; required?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-danger"> *</span>}
        </Label>
      )}
      {children(id)}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, count, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; count?: number; disabled?: boolean; id?: string }) {
  return (
    <label className={cn('flex items-center gap-2.5 py-1 text-sm cursor-pointer select-none', disabled && 'opacity-45 cursor-not-allowed')}>
      <input id={id} type="checkbox" className="h-4 w-4 rounded border-border accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex-1 text-fg2">{label}</span>
      {count != null && <span className="text-xs text-muted tabular">{count.toLocaleString('vi-VN')}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 cursor-pointer select-none text-sm', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      {label && <span className="text-fg2">{label}</span>}
    </label>
  );
}
