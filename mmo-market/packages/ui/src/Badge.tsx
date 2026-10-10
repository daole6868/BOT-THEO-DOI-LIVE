import type { ReactNode } from 'react';
import { cn } from './cn';
import { LEVELS, type Tone } from './labels';

const tones: Record<Tone, string> = {
  neutral: 'bg-subtle text-fg2',
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string }) {
  const m = map[value] ?? { label: value, tone: 'neutral' as Tone };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function LevelBadge({ level, className }: { level: string; className?: string }) {
  const l = LEVELS[level] ?? LEVELS.NEW;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', l.className, className)} title={`Cấp gian hàng: ${l.label}`}>
      <span aria-hidden>{l.icon}</span>
      {l.label}
    </span>
  );
}
