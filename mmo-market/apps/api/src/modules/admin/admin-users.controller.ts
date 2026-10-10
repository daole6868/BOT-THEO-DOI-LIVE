import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { MailService } from '../../common/mail.service';
import { PrismaService } from '../../common/prisma.service';
import { Z } from '../../common/zod.pipe';
import { LedgerService } from '../ledger/ledger.service';
import { AnalyticsService } from '../analytics/analytics.service';

const uuid = (v: string) => z.string().uuid().parse(v);
const reasonSchema = z.object({ reason: z.string().trim().min(5, 'Nhập lý do (tối thiểu 5 ký tự)').max(500) });
const maskEmail = (e: string) => {
  const [u, d] = e.split('@');
  return `${u.slice(0, 2)}***@${d}`;
};

@AdminArea()
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Perm('dashboard.view')
  @Get('dashboard')
  dashboard(@Query('range') range = '30') {
    const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
    return this.analytics.admin(days);
  }
}

@AdminArea()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly mail: MailService,
  ) {}

  @Perm('user.view')
  @Get()
  async list(@Query() q: Record<string, string>) {
    const p = z
      .object({
        q: z.string().max(100).optional(),
        status: z.enum(['UNVERIFIED', 'ACTIVE', 'LOCKED', 'BANNED']).optional(),
        kind: z.enum(['seller', 'staff', 'flagged']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(q);
    const where: Prisma.UserWhereInput = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.kind === 'seller' ? { store: { isNot: null } } : p.kind === 'staff' ? { isStaff: true } : p.kind === 'flagged' ? { riskFlags: { isEmpty: false } } : {}),
      ...(p.q
        ? { OR: [{ email: { contains: p.q.toLowerCase() } }, { username: { contains: p.q.toLowerCase() } }, { displayName: { contains: p.q, mode: 'insensitive' } }, ...(z.string().uuid().safeParse(p.q).success ? [{ id: p.q }] : [])] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
        select: { id: true, email: true, username: true, displayName: true, status: true, isStaff: true, mfaEnabled: true, riskFlags: true, createdAt: true, lastLoginAt: true, store: { select: { slug: true, name: true, level: true, status: true } }, role: { select: { name: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map((u) => ({ ...u, email: maskEmail(u.email) })), total, page: p.page, pageSize: p.pageSize };
  }

  @Perm('user.view')
  @Get(':id')
  async detail(@Param('id') id: string) {
    const u = await this.prisma.user.findUnique({ where: { id: uuid(id) }, include: { store: true, role: true, sellerApplication: { select: { status: true, fullName: true, submittedAt: true, reviewedAt: true } } } });
    if (!u) throw Errors.notFound('Người dùng');
    const [balances, orderStats, sellerStats, disputesOpened, logins, reportsAgainst, ips] = await Promise.all([
      this.ledger.balances(u.id),
      this.prisma.order.groupBy({ by: ['status'], where: { buyerId: u.id }, _count: true, _sum: { total: true } }),
      u.store ? this.prisma.order.groupBy({ by: ['status'], where: { storeId: u.store.id }, _count: true, _sum: { total: true } }) : [],
      this.prisma.dispute.count({ where: { openedById: u.id } }),
      this.prisma.loginEvent.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { ip: true, userAgent: true, result: true, createdAt: true, kind: true } }),
      this.prisma.report.count({ where: { targetType: 'USER', targetId: u.id } }),
      this.prisma.loginEvent.findMany({ where: { userId: u.id, result: 'success' }, distinct: ['ip'], select: { ip: true }, take: 20 }),
    ]);
    const ipList = ips.map((i) => i.ip).filter(Boolean) as string[];
    const related = ipList.length
      ? await this.prisma.loginEvent.findMany({ where: { ip: { in: ipList }, userId: { not: u.id }, result: 'success' }, distinct: ['userId'], select: { userId: true, ip: true }, take: 20 })
      : [];
    const relatedUsers = related.length ? await this.prisma.user.findMany({ where: { id: { in: related.map((r) => r.userId!).filter(Boolean) } }, select: { id: true, username: true, displayName: true, status: true } }) : [];
    return {
      id: u.id,
      email: maskEmail(u.email),
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      status: u.status,
      isStaff: u.isStaff,
      role: u.role?.name ?? null,
      mfaEnabled: u.mfaEnabled,
      riskFlags: u.riskFlags,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      withdrawLockedUntil: u.withdrawLockedUntil,
      store: u.store,
      application: u.sellerApplication,
      balances,
      purchases: orderStats.map((o) => ({ status: o.status, count: o._count, total: o._sum.total ?? 0n })),
      sales: sellerStats.map((o) => ({ status: o.status, count: o._count, total: o._sum.total ?? 0n })),
      disputesOpened,
      reportsAgainst,
      logins,
      relatedAccounts: relatedUsers.map((r) => ({ ...r, sharedIp: related.find((x) => x.userId === r.id)?.ip })),
    };
  }

  @Perm('user.view')
  @Post(':id/reveal-email')
  async revealEmail(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(reasonSchema)) body: { reason: string }) {
    const u = await this.prisma.user.findUnique({ where: { id: uuid(id) } });
    if (!u) throw Errors.notFound('Người dùng');
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'user.reveal_email', targetType: 'user', targetId: u.id, reason: body.reason });
    return { email: u.email };
  }

  @Perm('user.lock')
  @Post(':id/status')
  async setStatus(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(reasonSchema.extend({ status: z.enum(['ACTIVE', 'LOCKED', 'BANNED']) }))) body: { reason: string; status: 'ACTIVE' | 'LOCKED' | 'BANNED' }) {
    const u = await this.prisma.user.findUnique({ where: { id: uuid(id) } });
    if (!u) throw Errors.notFound('Người dùng');
    if (u.isStaff && !a.user.role?.permissions.includes('*')) throw Errors.forbidden('Chỉ Super Admin mới khoá được nhân sự');
    if (u.id === a.user.id) throw Errors.bad('Không thể tự khoá chính mình');
    await this.prisma.user.update({ where: { id: u.id }, data: { status: body.status, ...(body.status === 'ACTIVE' ? { lockedUntil: null, failedLoginCount: 0 } : {}) } });
    if (body.status !== 'ACTIVE') await this.prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (body.status === 'BANNED') await this.prisma.store.updateMany({ where: { ownerId: u.id }, data: { status: 'SUSPENDED', suspendReason: body.reason } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `user.${body.status.toLowerCase()}`, targetType: 'user', targetId: u.id, reason: body.reason, data: { from: u.status } });
    return { ok: true };
  }

  @Perm('user.mfa_reset')
  @Post(':id/mfa-reset')
  async mfaReset(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(reasonSchema)) body: { reason: string }) {
    const u = await this.prisma.user.findUnique({ where: { id: uuid(id) } });
    if (!u) throw Errors.notFound('Người dùng');
    if (u.id === a.user.id) throw Errors.bad('Không thể tự đặt lại 2FA của mình');
    await this.prisma.user.update({
      where: { id: u.id },
      data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: [], mfaLastStep: null, withdrawLockedUntil: new Date(Date.now() + 72 * 3600_000) },
    });
    await this.prisma.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'user.mfa_reset', targetType: 'user', targetId: u.id, reason: body.reason });
    this.mail.send(u.email, '2FA của bạn đã được đặt lại', ['Theo yêu cầu khôi phục, 2FA đã được đặt lại bởi bộ phận hỗ trợ. Rút tiền tạm khoá 72 giờ. Hãy bật lại 2FA ngay.', 'Nếu bạn không yêu cầu, liên hệ hỗ trợ ngay lập tức.']);
    return { ok: true };
  }

  @Perm('user.lock')
  @Post(':id/flags')
  async flags(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ flags: z.array(z.string().regex(/^[a-z_]{2,30}$/)).max(10) }))) body: { flags: string[] }) {
    await this.prisma.user.update({ where: { id: uuid(id) }, data: { riskFlags: body.flags } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'user.flags', targetType: 'user', targetId: id, data: { flags: body.flags } });
    return { ok: true };
  }
}

@AdminArea()
@Controller('admin/stores')
export class AdminStoresController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Perm('user.view')
  @Get()
  async list(@Query() q: Record<string, string>) {
    const p = z
      .object({ q: z.string().max(100).optional(), level: z.enum(['NEW', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND']).optional(), status: z.enum(['ACTIVE', 'VACATION', 'SUSPENDED']).optional(), page: z.coerce.number().int().min(1).default(1) })
      .parse(q);
    const where: Prisma.StoreWhereInput = {
      ...(p.level ? { level: p.level } : {}),
      ...(p.status ? { status: p.status } : {}),
      ...(p.q ? { OR: [{ name: { contains: p.q, mode: 'insensitive' } }, { slug: { contains: p.q.toLowerCase() } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.store.findMany({ where, orderBy: { completedOrders: 'desc' }, skip: (p.page - 1) * 20, take: 20, include: { owner: { select: { id: true, username: true, displayName: true } } } }),
      this.prisma.store.count({ where }),
    ]);
    return { items: items.map((s) => ({ ...s, disputeRatePct: s.completedOrders ? Math.round((s.disputeCount / s.completedOrders) * 1000) / 10 : 0 })), total, page: p.page, pageSize: 20 };
  }

  @Perm('store.manage')
  @Patch(':id')
  async update(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(reasonSchema.extend({ level: z.enum(['NEW', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND']).optional(), feeOverrideBps: z.number().int().min(0).max(5000).nullable().optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() })))
    body: { reason: string; level?: any; feeOverrideBps?: number | null; status?: 'ACTIVE' | 'SUSPENDED' },
  ) {
    const before = await this.prisma.store.findUnique({ where: { id: uuid(id) } });
    if (!before) throw Errors.notFound('Gian hàng');
    const store = await this.prisma.store.update({
      where: { id },
      data: {
        level: body.level,
        feeOverrideBps: body.feeOverrideBps,
        status: body.status,
        suspendReason: body.status === 'SUSPENDED' ? body.reason : body.status === 'ACTIVE' ? null : undefined,
      },
    });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'store.update', targetType: 'store', targetId: id, reason: body.reason, data: { before: { level: before.level, fee: before.feeOverrideBps, status: before.status }, after: { level: store.level, fee: store.feeOverrideBps, status: store.status } } });
    return store;
  }
}
