import { Injectable, Logger } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService, Tx } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { SettingsService } from '../../common/settings.service';
import { Acct, LedgerEntryInput, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger('Escrow');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  /** Thời gian giữ tiền = max(bảo hành sản phẩm, thời gian tối thiểu theo cấp gian hàng). */
  async holdHours(level: string, warrantyHours: number) {
    const byLevel = await this.settings.get('hold.hoursByLevel');
    return Math.max(warrantyHours, byLevel[level] ?? byLevel.NEW ?? 72);
  }

  private async lockHold(tx: Tx, orderId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM escrow_holds WHERE "orderId" = ${orderId}::uuid FOR UPDATE`;
    if (!rows.length) throw Errors.notFound('Khoản giữ tiền');
    return tx.escrowHold.findUniqueOrThrow({ where: { id: rows[0].id } });
  }

  /** Hoàn tiền (một phần hoặc toàn bộ) từ escrow về ví người mua. */
  async refundInTx(tx: Tx, order: Order, amount: bigint, key: string, description: string, actorId?: string | null) {
    const hold = await this.lockHold(tx, order.id);
    if (amount <= 0n) throw Errors.bad('Số tiền hoàn phải lớn hơn 0');
    if (!['HOLDING', 'FROZEN'].includes(hold.status) || amount > hold.amount) {
      throw Errors.business('REFUND_EXCEEDS', 'Số tiền hoàn vượt quá số tiền đang giữ');
    }
    await postLedger(tx, {
      type: 'refund',
      refType: 'order',
      refId: order.id,
      idempotencyKey: key,
      description,
      createdById: actorId ?? null,
      entries: [
        { account: Acct.escrow(order.sellerId), side: 'D', amount },
        { account: Acct.available(order.buyerId), side: 'C', amount },
      ],
    });
    const remaining = hold.amount - amount;
    await tx.escrowHold.update({
      where: { id: hold.id },
      data: { amount: remaining, status: remaining === 0n ? 'REFUNDED' : hold.status, releasedAt: remaining === 0n ? new Date() : null },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedAmount: { increment: amount },
        ...(remaining === 0n ? { status: 'REFUNDED', completedAt: new Date() } : {}),
      },
    });
    return remaining;
  }

  /** Giải ngân phần còn lại cho người bán (trừ phí sàn). */
  async releaseInTx(tx: Tx, orderId: string, reason: string): Promise<boolean> {
    const hold = await this.lockHold(tx, orderId);
    if (hold.status !== 'HOLDING') return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== 'DELIVERED') return false;
    const gross = hold.amount;
    const fee = (gross * BigInt(order.feeBps)) / 10_000n;
    const net = gross - fee;
    if (gross > 0n) {
      const entries: LedgerEntryInput[] = [{ account: Acct.escrow(order.sellerId), side: 'D', amount: gross }];
      if (net > 0n) entries.push({ account: Acct.available(order.sellerId), side: 'C', amount: net });
      if (fee > 0n) entries.push({ account: Acct.fee, side: 'C', amount: fee });
      await postLedger(tx, {
        type: 'escrow_release',
        refType: 'order',
        refId: order.id,
        idempotencyKey: `release:${order.id}`,
        description: `Giải ngân đơn ${order.code} (${reason})`,
        entries,
      });
    }
    await tx.escrowHold.update({ where: { id: hold.id }, data: { amount: 0n, status: 'RELEASED', releasedAt: new Date() } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED', completedAt: new Date(), feeAmount: fee } });
    await tx.store.update({ where: { id: order.storeId }, data: { completedOrders: { increment: 1 } } });
    await tx.orderEvent.create({ data: { orderId: order.id, type: 'completed', message: reason === 'buyer_confirmed' ? 'Người mua xác nhận hài lòng' : 'Hết thời gian bảo hành, tiền đã chuyển cho người bán' } });
    return true;
  }

  async releaseNow(orderId: string, reason: string) {
    const done = await this.prisma.tx((tx) => this.releaseInTx(tx, orderId, reason));
    if (done) await this.afterRelease(orderId);
    return done;
  }

  async afterRelease(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const net = Number(order.total - order.refundedAmount - order.feeAmount);
    await this.notify.notify(order.sellerId, {
      type: 'escrow.released',
      title: `+${net.toLocaleString('vi-VN')}đ từ đơn ${order.code}`,
      body: 'Tiền đã chuyển vào số dư khả dụng.',
      link: `/seller/don-hang/${order.code}`,
    });
    this.realtime.toUser(order.sellerId, 'wallet:updated', await this.ledger.balances(order.sellerId));
    this.realtime.toUser(order.buyerId, 'order:updated', { code: order.code, status: order.status });
  }

  /** Job: giải ngân các khoản đến hạn. */
  async releaseDue(limit = 200) {
    const due = await this.prisma.escrowHold.findMany({
      where: { status: 'HOLDING', releaseAt: { lte: new Date() }, order: { status: 'DELIVERED' } },
      select: { orderId: true },
      take: limit,
      orderBy: { releaseAt: 'asc' },
    });
    let n = 0;
    for (const d of due) {
      try {
        if (await this.releaseNow(d.orderId, 'auto')) n++;
      } catch (e: any) {
        this.logger.error(`Không giải ngân được đơn ${d.orderId}: ${e.message}`);
      }
    }
    return n;
  }
}
