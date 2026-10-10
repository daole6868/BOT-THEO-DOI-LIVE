import { Body, Controller, Delete, Get, Headers, HttpCode, Logger, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env';
import type { AuthContext } from '../../common/auth.types';
import { hmacSha256, safeEqual } from '../../common/crypto/crypto';
import { Auth, Public, RateLimit, SellerOnly, StepUp } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { requireIdemKey } from '../../common/util';
import { Z } from '../../common/zod.pipe';
import { AuthService } from '../auth/auth.service';
import { LedgerService } from '../ledger/ledger.service';
import { DepositsService } from './deposits.service';
import { WithdrawalsService } from './withdrawals.service';

const pageQ = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), type: z.string().max(40).optional() });

@Controller('wallet')
export class WalletController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly deposits: DepositsService,
    private readonly withdrawals: WithdrawalsService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  balance(@Auth() a: AuthContext) {
    return this.ledger.balances(a.user.id);
  }

  @Get('transactions')
  history(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    const p = pageQ.parse(q);
    return this.ledger.history(a.user.id, p.page, p.pageSize, p.type);
  }

  @RateLimit({ name: 'deposit', limit: 20, windowSec: 3600, by: 'user' })
  @Post('deposits')
  createDeposit(@Auth() a: AuthContext, @Body(Z(z.object({ amount: z.number().int().positive() }))) body: { amount: number }, @Headers() h: Record<string, string>) {
    return this.deposits.create(a.user.id, body.amount, requireIdemKey(h));
  }

  @Get('deposits')
  listDeposits(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    const p = pageQ.parse(q);
    return this.deposits.list(a.user.id, p.page, p.pageSize);
  }

  @Get('deposits/:code')
  getDeposit(@Auth() a: AuthContext, @Param('code') code: string) {
    return this.deposits.get(a.user.id, code);
  }

  @RateLimit({ name: 'claim', limit: 5, windowSec: 3600, by: 'user' })
  @Post('deposit-claims')
  claim(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ amount: z.number().int().positive().max(1_000_000_000), transferAt: z.coerce.date(), note: z.string().max(500).optional(), receiptUploadId: z.string().uuid().optional() })))
    body: { amount: number; transferAt: Date; note?: string; receiptUploadId?: string },
  ) {
    return this.deposits.createClaim(a.user.id, body);
  }

  @Get('deposit-claims')
  claims(@Auth() a: AuthContext) {
    return this.deposits.listClaims(a.user.id);
  }

  @Get('bank-accounts')
  banks(@Auth() a: AuthContext) {
    return this.withdrawals.listBanks(a.user.id);
  }

  @StepUp()
  @RateLimit({ name: 'bank-add', limit: 5, windowSec: 86400, by: 'user' })
  @Post('bank-accounts')
  async addBank(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ bankCode: z.string().regex(/^\d{6}$/), accountNumber: z.string().regex(/^\d{6,19}$/), holderName: z.string().trim().min(4).max(80), pin: z.string().regex(/^\d{6}$/) })))
    body: { bankCode: string; accountNumber: string; holderName: string; pin: string },
  ) {
    await this.auth.verifyPin(a.user, body.pin);
    return this.withdrawals.addBank(a, body);
  }

  @StepUp()
  @Delete('bank-accounts/:id')
  removeBank(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.withdrawals.removeBank(a, z.string().uuid().parse(id));
  }

  @SellerOnly()
  @StepUp()
  @RateLimit({ name: 'withdraw', limit: 10, windowSec: 3600, by: 'user' })
  @Post('withdrawals')
  async withdraw(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ bankAccountId: z.string().uuid(), amount: z.number().int().positive().max(10_000_000_000), pin: z.string().regex(/^\d{6}$/) })))
    body: { bankAccountId: string; amount: number; pin: string },
    @Headers() h: Record<string, string>,
  ) {
    const key = requireIdemKey(h);
    await this.auth.verifyPin(a.user, body.pin);
    return this.withdrawals.create(a, body, key);
  }

  @Get('withdrawals')
  myWithdrawals(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    const p = pageQ.parse(q);
    return this.withdrawals.listMine(a.user.id, p.page, p.pageSize);
  }

  @Post('withdrawals/:code/cancel')
  cancel(@Auth() a: AuthContext, @Param('code') code: string) {
    return this.withdrawals.cancel(a, code);
  }
}

/** Webhook từ cổng thanh toán. Không yêu cầu đăng nhập/CSRF nhưng bắt buộc xác thực chữ ký. */
@Controller('webhooks/payments')
export class PaymentWebhookController {
  private readonly logger = new Logger('Webhook');

  constructor(private readonly deposits: DepositsService) {}

  private checkIp(req: Request) {
    if (env.PAYMENT_WEBHOOK_IP_ALLOWLIST.length && !env.PAYMENT_WEBHOOK_IP_ALLOWLIST.includes(req.ip ?? '')) {
      this.logger.warn(`Webhook bị chặn từ IP ${req.ip}`);
      throw Errors.forbidden();
    }
  }

  /**
   * Định dạng chung: header X-Timestamp (giây), X-Signature = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
   * Body: { id, amount, content, type: "in" }
   */
  @Public()
  @RateLimit({ name: 'webhook', limit: 300, windowSec: 60 })
  @HttpCode(200)
  @Post('generic')
  async generic(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-timestamp') ts: string, @Headers('x-signature') sig: string) {
    this.checkIp(req);
    const raw = req.rawBody?.toString('utf8') ?? '';
    const t = Number(ts);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) throw Errors.forbidden('Timestamp không hợp lệ');
    const expected = hmacSha256(Buffer.from(env.PAYMENT_WEBHOOK_SECRET), `${ts}.${raw}`).toString('hex');
    if (!sig || !safeEqual(expected, sig)) {
      this.logger.error(`Chữ ký webhook sai từ IP ${req.ip}`);
      throw Errors.forbidden('Chữ ký không hợp lệ');
    }
    const body = z.object({ id: z.string().min(1).max(100), amount: z.number().int().positive(), content: z.string().max(500), type: z.enum(['in', 'out']) }).parse(JSON.parse(raw));
    if (body.type !== 'in') return { ok: true, result: 'ignored' };
    const result = await this.deposits.processIncoming({ provider: 'generic', providerTxnId: body.id, amount: body.amount, content: body.content, payload: body });
    return { ok: true, result };
  }

  /** SePay: header "Authorization: Apikey <SEPAY_API_KEY>" */
  @Public()
  @RateLimit({ name: 'webhook', limit: 300, windowSec: 60 })
  @HttpCode(200)
  @Post('sepay')
  async sepay(@Req() req: Request, @Headers('authorization') authz: string, @Body() body: any) {
    if (!env.SEPAY_API_KEY) throw Errors.notFound('Trang');
    this.checkIp(req);
    if (!authz || !safeEqual(authz, `Apikey ${env.SEPAY_API_KEY}`)) {
      this.logger.error(`API key SePay sai từ IP ${req.ip}`);
      throw Errors.forbidden();
    }
    const b = z.object({ id: z.union([z.number(), z.string()]), transferType: z.string(), transferAmount: z.number(), content: z.string().default(''), code: z.string().nullable().optional() }).parse(body);
    if (b.transferType !== 'in') return { success: true };
    await this.deposits.processIncoming({ provider: 'sepay', providerTxnId: String(b.id), amount: Math.round(b.transferAmount), content: `${b.code ?? ''} ${b.content}`, payload: body });
    return { success: true };
  }
}

/** Công cụ dev: giả lập ngân hàng báo có (chỉ bật khi ENABLE_DEV_TOOLS=true). */
@Controller('dev')
export class DevToolsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('deposits/:code/simulate-paid')
  async simulate(@Auth() a: AuthContext, @Param('code') code: string) {
    if (!env.ENABLE_DEV_TOOLS) throw Errors.notFound('Trang');
    const d = await this.prisma.deposit.findFirst({ where: { code, userId: a.user.id } });
    if (!d) throw Errors.notFound('Yêu cầu nạp');
    const result = await this.deposits.processIncoming({ provider: 'dev', providerTxnId: randomUUID(), amount: Number(d.amountExpected), content: `CK ${d.code}`, payload: { simulated: true } });
    return { result };
  }
}
