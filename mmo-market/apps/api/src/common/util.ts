import { z } from 'zod';

export const money = z.coerce.number().int().positive().max(10_000_000_000);
export const uuid = z.string().uuid();
export const idemKey = z.string().uuid({ message: 'Idempotency-Key phải là UUID' });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3600_000);
}

export function toNum(v: bigint | number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** Lấy Idempotency-Key từ header, bắt buộc là UUID. */
export function requireIdemKey(headers: Record<string, unknown>): string {
  const v = headers['idempotency-key'];
  return idemKey.parse(typeof v === 'string' ? v : undefined);
}
