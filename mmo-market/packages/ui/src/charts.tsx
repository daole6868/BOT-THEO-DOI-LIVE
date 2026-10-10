'use client';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from './cn';
import { compact, dayLabel, num, shortVnd, vnd } from './format';

const C = {
  s1: 'var(--chart-1)',
  s2: 'var(--chart-2)',
  s3: 'var(--chart-3)',
  prev: 'var(--chart-prev)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
};

/** Delta có mũi tên + chữ: không dùng màu đơn độc để thể hiện tăng/giảm. */
export function Delta({ value, suffix = 'so với kỳ trước', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', value === 0 ? 'text-muted' : good ? 'text-success' : 'text-danger')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {value > 0 ? '+' : ''}
      {value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%<span className="ml-1 font-normal text-muted">{suffix}</span>
    </span>
  );
}

export function Sparkline({ data, color = C.s1, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${color.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.25} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.replace(/\W/g, '')})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Thẻ KPI: nhãn · giá trị · thay đổi · sparkline. Bấm để đi tới trang chi tiết. */
export function StatCard({ label, value, delta, deltaInvert, hint, spark, icon, href, className, tone }: { label: string; value: ReactNode; delta?: number; deltaInvert?: boolean; hint?: ReactNode; spark?: number[]; icon?: ReactNode; href?: string; className?: string; tone?: 'default' | 'warning' | 'danger' }) {
  const body = (
    <div className={cn('group h-full rounded-xl border border-border bg-card p-4 transition', href && 'hover:border-primary/40 hover:shadow-sm', tone === 'danger' && 'border-danger/40', tone === 'warning' && 'border-warning/40', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted">{label}</span>
        {icon && <span className="text-muted group-hover:text-primary">{icon}</span>}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight text-fg">{value}</div>
      <div className="mt-1 min-h-[18px]">{delta != null ? <Delta value={delta} invert={deltaInvert} /> : hint ? <span className="text-xs text-muted">{hint}</span> : null}</div>
      {spark && spark.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={spark} />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function ChartTooltip({ active, payload, label, format, labels }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-fg">{label?.includes?.('-') ? dayLabel(label) : label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-fg2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.stroke || p.fill }} />
          <span>{labels?.[p.dataKey] ?? p.name}:</span>
          <span className="ml-auto font-semibold text-fg tabular">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-fg2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2" style={{ borderColor: i.color, borderStyle: i.dashed ? 'dashed' : 'solid' }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Xu hướng theo ngày: 1 chỉ số, 1 trục. Kỳ trước hiển thị nét đứt để so sánh.
 * Người dùng chuyển chỉ số bằng nút (không dùng biểu đồ 2 trục).
 */
export function TrendChart({ data, metrics, height = 280 }: { data: Record<string, any>[]; metrics: { key: string; prevKey?: string; label: string; money?: boolean }[]; height?: number }) {
  const [active, setActive] = useState(metrics[0].key);
  const m = metrics.find((x) => x.key === active) ?? metrics[0];
  const fmt = (v: number) => (m.money ? vnd(v) : num(v));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {metrics.length > 1 ? (
          <div className="inline-flex rounded-lg bg-subtle p-0.5">
            {metrics.map((x) => (
              <button key={x.key} type="button" onClick={() => setActive(x.key)} className={cn('rounded-md px-3 py-1 text-xs font-medium', active === x.key ? 'bg-card text-fg shadow-sm' : 'text-muted hover:text-fg')}>
                {x.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Legend items={[{ label: `${m.label} (kỳ này)`, color: C.s1 }, ...(m.prevKey ? [{ label: 'Kỳ trước', color: C.prev, dashed: true }] : [])]} />
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={C.s1} stopOpacity={0.22} />
                <stop offset="1" stopColor={C.s1} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="0" />
            <XAxis dataKey="day" tickFormatter={dayLabel} tick={{ fontSize: 11, fill: C.axis }} axisLine={{ stroke: C.grid }} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v) => (m.money ? shortVnd(v) : compact(v))} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} width={58} />
            <Tooltip content={<ChartTooltip format={fmt} labels={{ [m.key]: m.label, ...(m.prevKey ? { [m.prevKey]: 'Kỳ trước' } : {}) }} />} cursor={{ stroke: C.axis, strokeDasharray: '3 3' }} />
            {m.prevKey && <Line type="monotone" dataKey={m.prevKey} stroke={C.prev} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
            <Area type="monotone" dataKey={m.key} stroke={C.s1} strokeWidth={2} fill="url(#trend-fill)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Cột theo thời gian (1 chuỗi). */
export function ColumnChart({ data, xKey, yKey, label, money, height = 200, xFormat }: { data: Record<string, any>[]; xKey: string; yKey: string; label: string; money?: boolean; height?: number; xFormat?: (v: string) => string }) {
  const fmt = (v: number) => (money ? vnd(v) : num(v));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} tick={{ fontSize: 11, fill: C.axis }} axisLine={{ stroke: C.grid }} tickLine={false} />
          <YAxis tickFormatter={(v) => (money ? shortVnd(v) : compact(v))} tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} width={58} />
          <Tooltip content={<ChartTooltip format={fmt} labels={{ [yKey]: label }} />} cursor={{ fill: 'var(--subtle)' }} />
          <Bar dataKey={yKey} fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Danh sách thanh ngang có nhãn & giá trị (thay cho biểu đồ tròn). */
export function BarList({ items, money, onClick, color = C.s1 }: { items: { label: ReactNode; value: number; hint?: ReactNode; key?: string }[]; money?: boolean; onClick?: (key: string) => void; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i, idx) => (
        <li key={i.key ?? idx}>
          <button type="button" disabled={!onClick} onClick={() => i.key && onClick?.(i.key)} className={cn('w-full text-left', onClick && 'group')} title={money ? vnd(i.value) : num(i.value)}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-fg2 group-hover:text-fg">{i.label}</span>
              <span className="shrink-0 font-semibold text-fg tabular">
                {money ? shortVnd(i.value) : num(i.value)}
                {i.hint && <span className="ml-1.5 font-normal text-muted">{i.hint}</span>}
              </span>
            </div>
            <div className="h-2 rounded-full bg-subtle">
              <div className="h-2 rounded-full transition-all" style={{ width: i.value > 0 ? `${Math.max(2, (i.value / max) * 100)}%` : 0, background: color }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

/** Heatmap ngày trong tuần × giờ (màu tuần tự 1 sắc độ). */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; n: number }[] }) {
  const max = Math.max(1, ...cells.map((c) => c.n));
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.hour === h)?.n ?? 0;
  const color = (n: number) => (n === 0 ? 'var(--subtle)' : SEQ[Math.min(SEQ.length - 1, Math.floor((n / max) * (SEQ.length - 1)))]);
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `28px repeat(24, minmax(14px, 1fr))` }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center text-[10px] text-muted">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {DOW.map((d, di) => (
          <div key={d} className="contents">
            <span className="pr-1 text-right text-[11px] leading-[16px] text-muted">{d}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = get(di + 1, h);
              return <span key={h} className="h-4 rounded-[3px]" style={{ background: color(n) }} title={`${d} ${h}:00 – ${n} đơn`} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        Ít
        {SEQ.map((c) => (
          <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
        ))}
        Nhiều
      </div>
    </div>
  );
}

/** Thanh tiến độ (ví dụ tiến độ lên cấp). */
export function Meter({ value, label }: { value: number; label?: ReactNode }) {
  return (
    <div>
      {label && <div className="mb-1 text-xs text-muted">{label}</div>}
      <div className="h-2 rounded-full bg-subtle">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}
