const TZ = 'Asia/Ho_Chi_Minh';

/** 1.234.567 ₫ */
export function vnd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')}\u00a0₫`;
}

/** Rút gọn cho biểu đồ / thẻ nhỏ: 350 N, 1,2 tr, 1,5 tỷ */
export function shortVnd(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const fmt = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: v < 10 ? 1 : 0 });
  if (abs >= 1e9) return `${sign}${fmt(abs / 1e9)} tỷ`;
  if (abs >= 1e6) return `${sign}${fmt(abs / 1e6)} tr`;
  if (abs >= 1e3) return `${sign}${fmt(abs / 1e3)} N`;
  return `${sign}${abs}`;
}

export function num(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('vi-VN');
}

/** Số gọn cho trục: 0, 1K, 2,5K */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}B`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}K`;
  return String(n);
}

export function dateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateOnly(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dayLabel(isoDay: string): string {
  const [, m, d] = isoDay.split('-');
  return `${d}/${m}`;
}

/** "5 phút trước" dưới 24 giờ, sau đó ngày giờ đầy đủ. */
export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 0) return dateTime(d);
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày trước`;
  return dateOnly(d);
}

/** Khoảng thời gian còn lại: "2 ngày 3 giờ", "05:12:09" */
export function remaining(ms: number): string {
  if (ms <= 0) return 'đã hết hạn';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} ngày ${h} giờ`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function hoursLabel(h: number): string {
  if (h <= 0) return 'Không bảo hành';
  if (h % 24 === 0) return `${h / 24} ngày`;
  return `${h} giờ`;
}

export function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}
