import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { randomCode } from '../../common/crypto/crypto';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { SettingsService } from '../../common/settings.service';
import { StorageService } from '../../common/storage.service';
import { buildVietQrPayload } from '../../common/vietqr';
import { Acct, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';

const CODE_RE = /NAP[A-Z2-9]{8}/;

export interface IncomingTransfer {
  provider: string;
  providerTxnId: string;
  amount: number;
  content: string;
  payload: unknown;
}

@Injectable()
export class DepositsService {
  private readonly logger = new Logger('Deposits');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly storage: StorageService,
  ) {}

  private bankInfo() {
    return { bin: env.DEPOSIT_BANK_BIN, name: env.DEPOSIT_BANK_NAME, accountNo: env.DEPOSIT_ACCOUNT_NO, accountName: env.DEPOSIT_ACCOUNT_NAME };
  }

  private async view(d: { code: string; amountExpected: bigint; amountReceived: bigint | null; status: string; expiresAt: Date; createdAt: Date; completedAt: Date | null }) {
    const amount = Number(d.amountExpected);
    const payload = buildVietQrPayload({ bankBin: env.DEPOSIT_BANK_BIN, accountNo: env.DEPOSIT_ACCOUNT_NO, amount, addInfo: d.code });
    return {
      code: d.code,
      amount,
      amountReceived: d.amountReceived,
      status: d.status,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
      transferContent: d.code,
      bank: this.bankInfo(),
      qr: d.status === 'PENDING' ? await QRCode.toDataURL(payload, { margin: 1, width: 320 }) : null,
    };
  }

  async create(userId: string, amount: number, idemKey: string) {
    if (await this.settings.killSwitch('deposits')) throw Errors.killSwitch('nạp tiền');
    const [min, max, expireMin] = await Promise.all([
      this.settings.get('deposit.minAmount'),
      this.settings.get('deposit.maxAmount'),
      this.settings.get('deposit.expireMinutes'),
    ]);
    if (amount < min) throw Errors.bad(`Số tiền nạp tối thiểu ${min.toLocaleString('vi-VN')}đ`);
    if (amount > max) throw Errors.bad(`Số tiền nạp tối đa ${max.toLocaleString('vi-VN')}đ mỗi lần`);
    const existing = await this.prisma.deposit.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: idemKey } } });
    if (existing) return this.view(existing);
    const pending = await this.prisma.deposit.count({ where: { userId, status: 'PENDING', expiresAt: { gt: new Date() } } });
    if (pending >= 5) throw Errors.business('TOO_MANY_PENDING', 'Bạn có quá nhiều yêu cầu nạp đang chờ. Hãy hoàn tất hoặc đợi hết hạn.');
    const d = await this.prisma.deposit.create({
      data: {
        code: `NAP${randomCode(8)}`,
        userId,
        amountExpected: BigInt(amount),
        idempotencyKey: idemKey,
        expiresAt: new Date(Date.now() + expireMin * 60_000),
      },
    });
    return this.view(d);
  }

  async get(userId: string, code: string) {
    const d = await this.prisma.deposit.findFirst({ where: { code, userId } });
    if (!d) throw Errors.notFound('Yêu cầu nạp');
    return this.view(d);
  }

  async list(userId: string, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.deposit.count({ where: { userId } }),
    ]);
    return {
      items: items.map((d) => ({ code: d.code, amount: d.amountExpected, amountReceived: d.amountReceived, status: d.status, createdAt: d.createdAt, completedAt: d.completedAt, expiresAt: d.expiresAt })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Xử lý một giao dịch chuyển khoản đến (từ webhook hoặc đối soát).
   * Idempotent nhờ unique (provider, providerTxnId).
   */
  async processIncoming(t: IncomingTransfer): Promise<'processed' | 'duplicate' | 'unmatched'> {
    if (!Number.isSafeInteger(t.amount) || t.amount <= 0) return 'unmatched';
    const content = (t.content || '').toUpperCase().replace(/\s+/g, '');
    const code = content.match(CODE_RE)?.[0];
    let result: 'processed' | 'duplicate' | 'unmatched' = 'unmatched';
    let notifyUser: { userId: string; amount: bigint; code: string } | null = null;

    try {
      await this.prisma.tx(async (tx) => {
        const event = await tx.paymentWebhookEvent.create({
          data: {
            provider: t.provider,
            providerTxnId: t.providerTxnId,
            amount: BigInt(t.amount),
            content: t.content.slice(0, 500),
            payload: t.payload as Prisma.InputJsonValue,
            status: 'UNMATCHED',
          },
        });
        if (!code) return;
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM deposits WHERE code = ${code} FOR UPDATE`;
        if (!rows.length) return;
        const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: rows[0].id } });
        if (deposit.status === 'COMPLETED') return;
        const amount = BigInt(t.amount);
        await postLedger(tx, {
          type: 'deposit',
          refType: 'deposit',
          refId: deposit.id,
          idempotencyKey: `deposit:${deposit.id}`,
          description: `Nạp tiền ${deposit.code}`,
          entries: [
            { account: Acct.bank, side: 'D', amount },
            { account: Acct.available(deposit.userId), side: 'C', amount },
          ],
        });
        await tx.deposit.update({
          where: { id: deposit.id },
          data: { status: 'COMPLETED', amountReceived: amount, provider: t.provider, providerTxnId: t.providerTxnId, completedAt: new Date() },
        });
        await tx.paymentWebhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', depositId: deposit.id, matchedUserId: deposit.userId } });
        result = 'processed';
        notifyUser = { userId: deposit.userId, amount, code: deposit.code };
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return 'duplicate';
      throw e;
    }

    if (notifyUser) {
      const n = notifyUser as { userId: string; amount: bigint; code: string };
      const bal = await this.ledger.balances(n.userId);
      this.realtime.toUser(n.userId, 'deposit:completed', { code: n.code, amount: Number(n.amount) });
      this.realtime.toUser(n.userId, 'wallet:updated', bal);
      await this.notify.notify(n.userId, {
        type: 'deposit.completed',
        title: `Nạp tiền thành công +${Number(n.amount).toLocaleString('vi-VN')}đ`,
        body: `Mã nạp ${n.code}`,
        link: '/tai-khoan/vi',
      });
    } else {
      this.logger.warn(`Giao dịch ${t.provider}/${t.providerTxnId} chưa khớp (nội dung: ${t.content.slice(0, 60)})`);
    }
    return result;
  }

  async createClaim(userId: string, input: { amount: number; transferAt: Date; note?: string; receiptUploadId?: string }) {
    const open = await this.prisma.manualDepositClaim.count({ where: { userId, status: 'PENDING' } });
    if (open >= 3) throw Errors.business('TOO_MANY_CLAIMS', 'Bạn đang có 3 yêu cầu chờ xử lý');
    let receiptKey: string | undefined;
    if (input.receiptUploadId) {
      const [u] = await this.storage.assertOwned(userId, [input.receiptUploadId], ['receipt']);
      receiptKey = u.id;
    }
    return this.prisma.manualDepositClaim.create({
      data: { userId, amount: BigInt(input.amount), transferAt: input.transferAt, note: input.note, receiptKey },
    });
  }

  listClaims(userId: string) {
    return this.prisma.manualDepositClaim.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 });
  }
}
