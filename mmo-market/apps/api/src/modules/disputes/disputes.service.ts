import { Injectable, Logger } from '@nestjs/common';
import type { Dispute, Order } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService, Tx } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { SettingsService } from '../../common/settings.service';
import { StorageService } from '../../common/storage.service';
import { LedgerService } from '../ledger/ledger.service';
import { EscrowService } from '../orders/escrow.service';

export const DISPUTE_REASONS: Record<string, string> = {
  LOGIN_FAILED: 'Không đăng nhập / không sử dụng được',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  REVOKED: 'Bị thu hồi / khoá sau khi giao',
  MISSING: 'Thiếu hàng',
  SERVICE_NOT_DONE: 'Dịch vụ chưa hoàn thành / không đạt',
  OTHER: 'Lý do khác',
};

type Role = 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger('Disputes');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly escrow: EscrowService,
    private readonly storage: StorageService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  private event(tx: Tx, disputeId: string, actorId: string | null, actorRole: Role, type: string, message?: string, attachments: string[] = []) {
    return tx.disputeEvent.create({ data: { disputeId, actorId, actorRole, type, message, attachments } });
  }

  /** Số tiền ứng với các item bị khiếu nại (đơn tự động) hoặc toàn bộ (dịch vụ). */
  private refundFor(order: Order, itemCount: number) {
    if (order.deliveryType === 'MANUAL' || itemCount === 0) return order.total - order.refundedAmount;
    const perUnit = order.total / BigInt(order.units);
    const v = perUnit * BigInt(itemCount);
    const max = order.total - order.refundedAmount;
    return v > max ? max : v;
  }

  async open(a: AuthContext, code: string, input: { reason: string; description: string; stockItemIds: string[]; attachmentIds: string[] }) {
    if (!DISPUTE_REASONS[input.reason]) throw Errors.bad('Lý do không hợp lệ');
    const order = await this.prisma.order.findFirst({ where: { code, buyerId: a.user.id }, include: { escrow: true } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'DELIVERED' || !order.escrow || order.escrow.status !== 'HOLDING') {
      throw Errors.business('DISPUTE_NOT_ALLOWED', 'Chỉ khiếu nại được đơn đã giao và còn trong thời gian bảo hành');
    }
    if (order.escrow.releaseAt && order.escrow.releaseAt < new Date()) throw Errors.business('WARRANTY_EXPIRED', 'Đã hết thời gian bảo hành');
    if (order.deliveryType === 'AUTO') {
      if (!input.stockItemIds.length) throw Errors.bad('Chọn item bị lỗi');
      const owned = await this.prisma.stockItem.count({ where: { id: { in: input.stockItemIds }, orderId: order.id, status: 'SOLD' } });
      if (owned !== new Set(input.stockItemIds).size) throw Errors.bad('Item không thuộc đơn hàng');
    }
    const uploads = await this.storage.assertOwned(a.user.id, input.attachmentIds, ['dispute']);
    const hours = await this.settings.get('dispute.sellerResponseHours');

    const dispute = await this.prisma.tx(async (tx) => {
      const r = await tx.order.updateMany({ where: { id: order.id, status: 'DELIVERED' }, data: { status: 'DISPUTED' } });
      if (!r.count) throw Errors.conflict('ORDER_CHANGED', 'Đơn hàng vừa thay đổi trạng thái');
      await tx.escrowHold.update({ where: { orderId: order.id }, data: { status: 'FROZEN' } });
      const d = await tx.dispute.create({
        data: {
          orderId: order.id,
          openedById: a.user.id,
          reason: input.reason,
          description: input.description,
          attachments: uploads.map((u) => u.id),
          stockItemIds: [...new Set(input.stockItemIds)],
          sellerDeadline: new Date(Date.now() + hours * 3600_000),
          proposedRefund: this.refundFor(order, new Set(input.stockItemIds).size),
        },
      });
      await this.event(tx, d.id, a.user.id, 'BUYER', 'opened', input.description, uploads.map((u) => u.id));
      await tx.orderEvent.create({ data: { orderId: order.id, type: 'disputed', actorId: a.user.id, message: `Người mua khiếu nại: ${DISPUTE_REASONS[input.reason]}` } });
      await tx.store.update({ where: { id: order.storeId }, data: { disputeCount: { increment: 1 } } });
      return d;
    });
    await this.notify.notify(order.sellerId, {
      type: 'dispute.opened',
      title: `Khiếu nại mới đơn ${order.code}`,
      body: `Bạn có ${hours} giờ để phản hồi, quá hạn hệ thống sẽ tự hoàn tiền.`,
      link: `/seller/khieu-nai`,
    });
    return dispute;
  }

  private async load(id: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { order: true } });
    if (!d) throw Errors.notFound('Khiếu nại');
    return d;
  }

  private assertParty(d: Dispute & { order: Order }, a: AuthContext): 'BUYER' | 'SELLER' {
    if (d.order.buyerId === a.user.id) return 'BUYER';
    if (d.order.sellerId === a.user.id) return 'SELLER';
    throw Errors.notFound('Khiếu nại');
  }

  async addMessage(a: AuthContext, id: string, message: string, attachmentIds: string[]) {
    const d = await this.load(id);
    const role = this.assertParty(d, a);
    if (d.status === 'RESOLVED') throw Errors.bad('Khiếu nại đã đóng');
    const uploads = await this.storage.assertOwned(a.user.id, attachmentIds, ['dispute']);
    await this.prisma.disputeEvent.create({ data: { disputeId: id, actorId: a.user.id, actorRole: role, type: 'message', message, attachments: uploads.map((u) => u.id) } });
    const other = role === 'BUYER' ? d.order.sellerId : d.order.buyerId;
    await this.notify.notify(other, { type: 'dispute.message', title: `Tin nhắn mới trong khiếu nại đơn ${d.order.code}`, body: message.slice(0, 120), link: role === 'BUYER' ? '/seller/khieu-nai' : `/tai-khoan/don-hang/${d.order.code}` });
    if (d.assignedAdminId) await this.notify.notify(d.assignedAdminId, { type: 'dispute.message', title: `Tin nhắn mới khiếu nại ${d.order.code}`, link: `/disputes/${d.id}` });
    return { ok: true };
  }

  /** Người bán phản hồi: đổi item / hoàn tiền / từ chối. */
  async sellerRespond(a: AuthContext, id: string, input: { action: 'REPLACE' | 'REFUND' | 'REJECT'; amount?: number; message: string }) {
    const d = await this.load(id);
    if (d.order.sellerId !== a.user.id) throw Errors.notFound('Khiếu nại');
    if (d.status !== 'OPEN') throw Errors.bad('Khiếu nại không ở trạng thái chờ người bán');
    const buyerHours = await this.settings.get('dispute.buyerResponseHours');

    if (input.action === 'REFUND') {
      const max = d.order.total - d.order.refundedAmount;
      const amount = input.amount != null ? BigInt(input.amount) : (d.proposedRefund ?? max);
      if (amount <= 0n || amount > max) throw Errors.bad('Số tiền hoàn không hợp lệ');
      await this.prisma.tx(async (tx) => {
        await this.markItemsRefunded(tx, d);
        await this.escrow.refundInTx(tx, d.order, amount, `dispute:${d.id}:refund`, `Hoàn tiền khiếu nại đơn ${d.order.code}`, a.user.id);
        await this.close(tx, d, amount === max ? 'REFUND_FULL' : 'REFUND_PARTIAL', amount, a.user.id, 'SELLER', input.message);
      });
      await this.afterResolve(d.id);
      return { ok: true };
    }

    if (input.action === 'REPLACE') {
      if (d.order.deliveryType !== 'AUTO') throw Errors.bad('Chỉ đơn giao tự động mới đổi item được');
      const need = d.stockItemIds.length;
      await this.prisma.tx(async (tx) => {
        const fresh = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM stock_items WHERE "productId" = ${d.order.productId}::uuid AND status = 'AVAILABLE'
          ORDER BY "createdAt" LIMIT ${need} FOR UPDATE SKIP LOCKED`;
        if (fresh.length < need) throw Errors.business('OUT_OF_STOCK', `Kho không đủ ${need} item để đổi`);
        await tx.stockItem.updateMany({ where: { id: { in: d.stockItemIds }, orderId: d.orderId }, data: { status: 'REVOKED' } });
        await tx.stockItem.updateMany({ where: { id: { in: fresh.map((f) => f.id) } }, data: { status: 'SOLD', orderId: d.orderId, soldAt: new Date() } });
        await tx.$executeRaw`UPDATE products SET "stockTotal" = GREATEST(0, "stockTotal" - ${need}) WHERE id = ${d.order.productId}::uuid`;
        await tx.dispute.update({
          where: { id: d.id },
          data: { status: 'SELLER_RESPONDED', sellerAction: 'REPLACE', sellerMessage: input.message, buyerDeadline: new Date(Date.now() + buyerHours * 3600_000) },
        });
        await this.event(tx, d.id, a.user.id, 'SELLER', 'replaced', `Đã đổi ${need} item mới. ${input.message}`);
      });
    } else {
      await this.prisma.tx(async (tx) => {
        await tx.dispute.update({
          where: { id: d.id },
          data: { status: 'SELLER_RESPONDED', sellerAction: 'REJECT', sellerMessage: input.message, buyerDeadline: new Date(Date.now() + buyerHours * 3600_000) },
        });
        await this.event(tx, d.id, a.user.id, 'SELLER', 'rejected', input.message);
      });
    }
    await this.notify.notify(d.order.buyerId, {
      type: 'dispute.responded',
      title: input.action === 'REPLACE' ? `Người bán đã đổi item cho đơn ${d.order.code}` : `Người bán từ chối khiếu nại đơn ${d.order.code}`,
      body: `Bạn có ${buyerHours} giờ để chấp nhận hoặc yêu cầu admin phân xử.`,
      link: `/tai-khoan/don-hang/${d.order.code}`,
    });
    return { ok: true };
  }

  private async markItemsRefunded(tx: Tx, d: Dispute) {
    if (d.stockItemIds.length) await tx.stockItem.updateMany({ where: { id: { in: d.stockItemIds }, orderId: d.orderId }, data: { status: 'REVOKED' } });
  }

  /** Đóng khiếu nại, mở băng escrow nếu còn tiền. */
  private async close(tx: Tx, d: Dispute & { order: Order }, resolution: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REPLACED' | 'REJECTED' | 'WITHDRAWN', refund: bigint, actorId: string | null, role: Role, note?: string) {
    await tx.dispute.update({
      where: { id: d.id },
      data: { status: 'RESOLVED', resolution, refundAmount: refund, resolvedById: actorId, resolvedAt: new Date(), resolutionNote: note },
    });
    await this.event(tx, d.id, actorId, role, 'resolved', note);
    const hold = await tx.escrowHold.findUniqueOrThrow({ where: { orderId: d.orderId } });
    if (hold.amount > 0n) {
      const releaseAt = hold.releaseAt && hold.releaseAt > new Date() ? hold.releaseAt : new Date(Date.now() + 3600_000);
      await tx.escrowHold.update({ where: { id: hold.id }, data: { status: 'HOLDING', releaseAt } });
      await tx.order.update({ where: { id: d.orderId }, data: { status: 'DELIVERED' } });
    }
    const labels: Record<string, string> = {
      REFUND_FULL: 'Hoàn tiền toàn bộ',
      REFUND_PARTIAL: `Hoàn tiền một phần (${Number(refund).toLocaleString('vi-VN')}đ)`,
      REPLACED: 'Đã đổi item',
      REJECTED: 'Khiếu nại không được chấp nhận',
      WITHDRAWN: 'Người mua rút khiếu nại',
    };
    await tx.orderEvent.create({ data: { orderId: d.orderId, type: 'dispute_resolved', actorId, message: `Khiếu nại đã đóng: ${labels[resolution]}` } });
  }

  private async afterResolve(id: string) {
    const d = await this.load(id);
    await this.notify.notifyMany([d.order.buyerId, d.order.sellerId], {
      type: 'dispute.resolved',
      title: `Khiếu nại đơn ${d.order.code} đã được giải quyết`,
      body: d.resolutionNote ?? undefined,
      link: `/tai-khoan/don-hang/${d.order.code}`,
    });
    this.realtime.toUser(d.order.buyerId, 'wallet:updated', await this.ledger.balances(d.order.buyerId));
  }

  /** Người mua chấp nhận phản hồi của người bán (hoặc rút khiếu nại). */
  async buyerAccept(a: AuthContext, id: string) {
    const d = await this.load(id);
    if (d.order.buyerId !== a.user.id) throw Errors.notFound('Khiếu nại');
    if (!['OPEN', 'SELLER_RESPONDED', 'ESCALATED'].includes(d.status)) throw Errors.bad('Khiếu nại đã đóng');
    const resolution = d.status === 'OPEN' ? 'WITHDRAWN' : d.sellerAction === 'REPLACE' ? 'REPLACED' : d.sellerAction === 'REJECT' ? 'REJECTED' : 'WITHDRAWN';
    await this.prisma.tx((tx) => this.close(tx, d, resolution, 0n, a.user.id, 'BUYER', 'Người mua chấp nhận'));
    await this.afterResolve(id);
    return { ok: true };
  }

  async escalate(a: AuthContext, id: string, message: string) {
    const d = await this.load(id);
    const role = this.assertParty(d, a);
    if (!['OPEN', 'SELLER_RESPONDED'].includes(d.status)) throw Errors.bad('Không thể leo thang khiếu nại này');
    if (role === 'BUYER' && d.status === 'OPEN' && d.sellerDeadline > new Date()) {
      throw Errors.bad('Hãy chờ người bán phản hồi trước khi yêu cầu admin');
    }
    await this.prisma.tx(async (tx) => {
      await tx.dispute.update({ where: { id }, data: { status: 'ESCALATED' } });
      await this.event(tx, id, a.user.id, role, 'escalated', message);
    });
    this.realtime.toStaff('dispute:escalated', { id, code: d.order.code });
    await this.notify.notify(role === 'BUYER' ? d.order.sellerId : d.order.buyerId, { type: 'dispute.escalated', title: `Khiếu nại đơn ${d.order.code} đã chuyển admin phân xử`, link: role === 'BUYER' ? '/seller/khieu-nai' : `/tai-khoan/don-hang/${d.order.code}` });
    return { ok: true };
  }

  async listForSeller(sellerId: string, status?: string) {
    const rows = await this.prisma.dispute.findMany({
      where: { order: { sellerId }, ...(status ? { status: status as any } : {}) },
      orderBy: [{ status: 'asc' }, { sellerDeadline: 'asc' }],
      take: 100,
      include: { order: { select: { code: true, title: true, total: true, units: true, deliveryType: true, buyer: { select: { username: true, displayName: true } } } } },
    });
    return rows.map((d) => ({ ...d, reasonLabel: DISPUTE_REASONS[d.reason] }));
  }

  // ---------------- Admin ----------------

  async adminList(status: string | undefined, page: number, pageSize: number) {
    const where = status ? { status: status as any } : { status: { in: ['ESCALATED', 'OPEN', 'SELLER_RESPONDED'] as any } };
    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: [{ updatedAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { select: { code: true, title: true, total: true, buyerId: true, sellerId: true, store: { select: { name: true, slug: true } } } } },
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { items: items.map((d) => ({ ...d, reasonLabel: DISPUTE_REASONS[d.reason] })), total, page, pageSize };
  }

  async adminDetail(id: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { order: { include: { store: true, buyer: { select: { id: true, username: true, displayName: true, createdAt: true } } } }, events: { orderBy: { createdAt: 'asc' } } } });
    if (!d) throw Errors.notFound('Khiếu nại');
    const [buyerOrders, buyerDisputes] = await Promise.all([
      this.prisma.order.count({ where: { buyerId: d.order.buyerId } }),
      this.prisma.dispute.count({ where: { openedById: d.order.buyerId } }),
    ]);
    const urls = new Map((await this.storage.signedUrls([...d.attachments, ...d.events.flatMap((e) => e.attachments)])).map((u) => [u.id, u.url]));
    return {
      ...d,
      reasonLabel: DISPUTE_REASONS[d.reason],
      attachments: d.attachments.map((x) => urls.get(x)).filter(Boolean),
      events: d.events.map((e) => ({ ...e, attachments: e.attachments.map((x) => urls.get(x)).filter(Boolean) })),
      signals: {
        buyerOrders,
        buyerDisputes,
        storeDisputeRatePct: d.order.store.completedOrders ? Math.round((d.order.store.disputeCount / d.order.store.completedOrders) * 1000) / 10 : 0,
      },
    };
  }

  async adminMessage(staff: AuthContext, id: string, message: string) {
    const d = await this.load(id);
    await this.prisma.disputeEvent.create({ data: { disputeId: id, actorId: staff.user.id, actorRole: 'ADMIN', type: 'message', message } });
    if (!d.assignedAdminId) await this.prisma.dispute.update({ where: { id }, data: { assignedAdminId: staff.user.id } });
    await this.notify.notifyMany([d.order.buyerId, d.order.sellerId], { type: 'dispute.admin_message', title: `Admin đã nhắn trong khiếu nại đơn ${d.order.code}`, body: message.slice(0, 120), link: `/tai-khoan/don-hang/${d.order.code}` });
    return { ok: true };
  }

  async adminResolve(staff: AuthContext, id: string, input: { resolution: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REJECTED'; amount?: number; note: string }) {
    const d = await this.load(id);
    if (d.status === 'RESOLVED') throw Errors.bad('Khiếu nại đã đóng');
    const max = d.order.total - d.order.refundedAmount;
    await this.prisma.tx(async (tx) => {
      if (input.resolution === 'REJECTED') {
        await this.close(tx, d, 'REJECTED', 0n, staff.user.id, 'ADMIN', input.note);
      } else {
        const amount = input.resolution === 'REFUND_FULL' ? max : BigInt(input.amount ?? 0);
        if (amount <= 0n || amount > max) throw Errors.bad('Số tiền hoàn không hợp lệ');
        await this.markItemsRefunded(tx, d);
        await this.escrow.refundInTx(tx, d.order, amount, `dispute:${d.id}:admin`, `Admin phân xử khiếu nại đơn ${d.order.code}`, staff.user.id);
        await this.close(tx, d, amount === max ? 'REFUND_FULL' : 'REFUND_PARTIAL', amount, staff.user.id, 'ADMIN', input.note);
      }
      await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'dispute.resolve', targetType: 'dispute', targetId: id, reason: input.note, data: { resolution: input.resolution, amount: input.amount } }, tx);
    });
    await this.afterResolve(id);
    return { ok: true };
  }

  // ---------------- Job ----------------

  /** Quá hạn: người bán không phản hồi -> tự hoàn tiền; người mua không phản hồi -> giữ kết quả của người bán. */
  async autoResolve() {
    const now = new Date();
    const sellerLate = await this.prisma.dispute.findMany({ where: { status: 'OPEN', sellerDeadline: { lt: now } }, include: { order: true }, take: 100 });
    for (const d of sellerLate) {
      try {
        const amount = d.proposedRefund && d.proposedRefund > 0n ? d.proposedRefund : d.order.total - d.order.refundedAmount;
        const max = d.order.total - d.order.refundedAmount;
        const refund = amount > max ? max : amount;
        await this.prisma.tx(async (tx) => {
          await this.markItemsRefunded(tx, d);
          if (refund > 0n) await this.escrow.refundInTx(tx, d.order, refund, `dispute:${d.id}:auto`, `Tự động hoàn tiền: người bán không phản hồi khiếu nại`, null);
          await this.close(tx, d, refund === max ? 'REFUND_FULL' : 'REFUND_PARTIAL', refund, null, 'SYSTEM', 'Người bán không phản hồi đúng hạn, hệ thống tự hoàn tiền');
        });
        await this.afterResolve(d.id);
      } catch (e: any) {
        this.logger.error(`Tự xử lý khiếu nại ${d.id} lỗi: ${e.message}`);
      }
    }
    const buyerLate = await this.prisma.dispute.findMany({ where: { status: 'SELLER_RESPONDED', buyerDeadline: { lt: now } }, include: { order: true }, take: 100 });
    for (const d of buyerLate) {
      try {
        await this.prisma.tx((tx) =>
          this.close(tx, d, d.sellerAction === 'REPLACE' ? 'REPLACED' : 'REJECTED', 0n, null, 'SYSTEM', 'Người mua không phản hồi đúng hạn, giữ nguyên phản hồi của người bán'),
        );
        await this.afterResolve(d.id);
      } catch (e: any) {
        this.logger.error(`Tự đóng khiếu nại ${d.id} lỗi: ${e.message}`);
      }
    }
    return sellerLate.length + buyerLate.length;
  }
}
