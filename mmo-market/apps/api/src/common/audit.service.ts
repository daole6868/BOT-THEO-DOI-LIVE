import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { sha256Hex } from './crypto/crypto';
import { PrismaService, Tx } from './prisma.service';

/** JSON với khoá được sắp xếp (jsonb của Postgres không giữ thứ tự khoá). */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const obj = v as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export interface AuditEntry {
  actorId?: string | null;
  ip?: string;
  userAgent?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  data?: Record<string, unknown>;
}

/** Nhật ký kiểm toán dạng chuỗi băm: mỗi dòng chứa hash của dòng trước -> sửa/xoá sẽ bị phát hiện. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Tx) {
    const run = async (t: Tx) => {
      await t.$executeRaw`SELECT pg_advisory_xact_lock(8675309)`;
      const last = await t.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const prevHash = last?.hash ?? null;
      const createdAt = new Date();
      const data = entry.data ? JSON.parse(JSON.stringify(entry.data, (_, v) => (typeof v === 'bigint' ? Number(v) : v))) : undefined;
      const canonical = stableStringify({
        prevHash,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        reason: entry.reason ?? null,
        data: data ?? null,
        createdAt: createdAt.toISOString(),
      });
      await t.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorIp: entry.ip,
          actorUa: entry.userAgent?.slice(0, 300),
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          reason: entry.reason,
          data: data as Prisma.InputJsonValue | undefined,
          prevHash,
          hash: sha256Hex(canonical),
          createdAt,
        },
      });
    };
    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /** Kiểm tra toàn bộ chuỗi băm còn nguyên vẹn. */
  async verifyChain(limit = 100_000): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { id: 'asc' }, take: limit });
    let prev: string | null = null;
    for (const r of rows) {
      const canonical = stableStringify({
        prevHash: prev,
        actorId: r.actorId ?? null,
        action: r.action,
        targetType: r.targetType ?? null,
        targetId: r.targetId ?? null,
        reason: r.reason ?? null,
        data: r.data ?? null,
        createdAt: r.createdAt.toISOString(),
      });
      if (r.prevHash !== prev || sha256Hex(canonical) !== r.hash) return { ok: false, checked: rows.length, brokenAt: r.id.toString() };
      prev = r.hash;
    }
    return { ok: true, checked: rows.length };
  }
}
