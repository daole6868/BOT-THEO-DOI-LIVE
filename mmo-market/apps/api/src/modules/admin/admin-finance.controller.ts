import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { Z } from '../../common/zod.pipe';
import { LedgerService } from '../ledger/ledger.service';
import { AdjustmentsService } from '../wallet/adjustments.service';
import { WithdrawalsService } from '../wallet/withdrawals.service';

const pageOf = (v?: string) => Math.max(1, Number(v) || 1);

@AdminArea()
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly adjustments: AdjustmentsService,
    private readonly withdrawals: WithdrawalsService,
    private readonly storage: StorageService,
  ) {}

  @Perm('deposit.manage')
  @Get('deposits')
  async deposits(@Query('status') status?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const where = {
      ...(status && ['PENDING', 'COMPLETED', 'EXPIRED'].includes(status) ? { status: status as any } : {}),
      ...(q ? { code: { contains: q.toUpperCase() } } : {}),
    };
    const p = pageOf(page);
    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * 30, take: 30 }),
      this.prisma.deposit.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: items.map((i) => i.userId) } }, select: { id: true, username: true } });
    return { items: items.map((d) => ({ ...d, user: users.find((u) => u.id === d.userId) })), total, page: p, pageSize: 30 };
  }

  @Perm('deposit.manage')
  @Get('bank-events')
  async bankEvents(@Query('status') status = 'UNMATCHED', @Query('page') page?: string) {
    const p = pageOf(page);
    const where = { status: status as any };
    const [items, total] = await Promise.all([
      this.prisma.paymentWebhookEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * 30, take: 30 }),
      this.prisma.paymentWebhookEvent.count({ where }),
    ]);
    return { items, total, page: p, pageSize: 30 };
  }

  @Perm('deposit.manage')
  @Get('claims')
  async claims(@Query('status') status = 'PENDING') {
    const rows = await this.prisma.manualDepositClaim.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, take: 100 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, username: true, displayName: true } });
    const receipts = new Map((await this.storage.signedUrls(rows.map((r) => r.receiptKey).filter(Boolean) as string[])).map((u) => [u.id, u.url]));
    return rows.map((r) => ({ ...r, user: users.find((u) => u.id === r.userId), receiptUrl: r.receiptKey ? receipts.get(r.receiptKey) : null }));
  }

  @Perm('deposit.manage')
  @Post('claims/:id/reject')
  rejectClaim(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ note: z.string().trim().min(5).max(500) }))) body: { note: string }) {
    return this.adjustments.rejectClaim(a, z.string().uuid().parse(id), body.note);
  }

  @Perm('adjustment.request')
  @Get('adjustments')
  async adjustmentsList(@Query('status') status = 'PENDING') {
    const rows = await this.prisma.balanceAdjustment.findMany({ where: { status: status as any }, orderBy: { createdAt: 'desc' }, take: 100 });
    const ids = [...new Set(rows.flatMap((r) => [r.userId, r.requestedById, r.decidedById].filter(Boolean) as string[]))];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true } });
    const u = (id?: string | null) => users.find((x) => x.id === id);
    return rows.map((r) => ({ ...r, user: u(r.userId), requestedBy: u(r.requestedById), decidedBy: u(r.decidedById) }));
  }

  @Perm('adjustment.request')
  @Post('adjustments')
  request(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ userId: z.string().uuid(), direction: z.enum(['CREDIT', 'DEBIT']), amount: z.number().int().positive().max(1_000_000_000), reason: z.string().trim().min(10).max(500), type: z.enum(['MANUAL', 'DEPOSIT_MATCH', 'CLAIM']), refId: z.string().uuid().optional() })))
    body: { userId: string; direction: 'CREDIT' | 'DEBIT'; amount: number; reason: string; type: 'MANUAL' | 'DEPOSIT_MATCH' | 'CLAIM'; refId?: string },
  ) {
    return this.adjustments.request(a, body);
  }

  @Perm('adjustment.approve')
  @Post('adjustments/:id/decide')
  decide(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ approve: z.boolean(), note: z.string().max(500).optional() }))) body: { approve: boolean; note?: string }) {
    return this.adjustments.decide(a, z.string().uuid().parse(id), body.approve, body.note);
  }

  @Perm('withdrawal.approve')
  @Get('withdrawals')
  withdrawalsList(@Query('status') status?: string, @Query('page') page?: string) {
    return this.withdrawals.adminList(['REQUESTED', 'ON_HOLD', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'].includes(status ?? '') ? status : undefined, pageOf(page), 30);
  }

  @Perm('withdrawal.pay')
  @Post('withdrawals/:code/reveal')
  reveal(@Auth() a: AuthContext, @Param('code') code: string) {
    return this.withdrawals.revealAccount(a, code);
  }

  @Perm('withdrawal.approve')
  @Post('withdrawals/:code/approve')
  approve(@Auth() a: AuthContext, @Param('code') code: string) {
    return this.withdrawals.adminAction(a, code, 'approve', {});
  }

  @Perm('withdrawal.approve')
  @Post('withdrawals/:code/hold')
  hold(@Auth() a: AuthContext, @Param('code') code: string, @Body(Z(z.object({ reason: z.string().trim().min(5).max(500) }))) body: { reason: string }) {
    return this.withdrawals.adminAction(a, code, 'hold', body);
  }

  @Perm('withdrawal.approve')
  @Post('withdrawals/:code/reject')
  reject(@Auth() a: AuthContext, @Param('code') code: string, @Body(Z(z.object({ reason: z.string().trim().min(5).max(500) }))) body: { reason: string }) {
    return this.withdrawals.adminAction(a, code, 'reject', body);
  }

  @Perm('withdrawal.pay')
  @Post('withdrawals/:code/mark-paid')
  paid(@Auth() a: AuthContext, @Param('code') code: string, @Body(Z(z.object({ bankRef: z.string().trim().min(3).max(100) }))) body: { bankRef: string }) {
    return this.withdrawals.adminAction(a, code, 'mark_paid', body);
  }

  @Perm('ledger.view')
  @Get('ledger')
  async ledgerList(@Query('type') type?: string, @Query('q') q?: string, @Query('page') page?: string) {
    const p = pageOf(page);
    const where = { ...(type ? { type } : {}), ...(q ? { OR: [{ refId: q }, { description: { contains: q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total, accounts] = await Promise.all([
      this.prisma.ledgerTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * 30, take: 30, include: { entries: { include: { account: { select: { key: true, kind: true } } } } } }),
      this.prisma.ledgerTransaction.count({ where }),
      this.prisma.ledgerAccount.groupBy({ by: ['kind'], _sum: { balance: true }, _count: true }),
    ]);
    return {
      items: items.map((t) => ({ ...t, entries: t.entries.map((e) => ({ id: e.id.toString(), side: e.side, amount: e.amount, balanceAfter: e.balanceAfter, account: e.account.key, kind: e.account.kind })) })),
      total,
      page: p,
      pageSize: 30,
      totals: accounts.map((a) => ({ kind: a.kind, balance: a._sum.balance ?? 0n, accounts: a._count })),
    };
  }

  @Perm('ledger.view')
  @Post('ledger/verify')
  verify() {
    return this.ledger.verify();
  }
}
