import { Injectable } from '@nestjs/common';
import type { Order, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { randomCode } from '../../common/crypto/crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppError, Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { RealtimeService } from '../../common/realtime.service';
import { SettingsService } from '../../common/settings.service';
import { StorageService } from '../../common/storage.service';
import { Acct, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';
import { EscrowService } from './escrow.service';

const OPEN_STATUSES = ['PAID', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED'] as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly escrow: EscrowService,
    private readonly crypto: CryptoService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async feeBpsFor(storeFeeOverride: number | null, categoryId: string | null) {
    if (storeFeeOverride != null) return storeFeeOverride;
    if (categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (c) return c.feeBps;
    }
    return this.settings.get('fees.defaultBps');
  }

  // ---------------- Đặt hàng ----------------

  async create(a: AuthContext, input: { variantId: string; qty: number; buyerInput?: string }, idemKey: string) {
    if (await this.settings.killSwitch('orders')) throw Errors.killSwitch('đặt hàng');
    const buyer = a.user;
    const existing = await this.prisma.order.findUnique({ where: { buyerId_idempotencyKey: { buyerId: buyer.id, idempotencyKey: idemKey } } });
    if (existing) return { code: existing.code, status: existing.status, duplicate: true };

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { include: { store: true, category: true } } },
    });
    if (!variant || !variant.isActive) throw Errors.notFound('Gói sản phẩm');
    const product = variant.product;
    const store = product.store;
    if (product.status !== 'ACTIVE' || product.deletedAt) throw Errors.business('PRODUCT_UNAVAILABLE', 'Sản phẩm hiện không mở bán');
    if (store.status === 'SUSPENDED') throw Errors.business('STORE_SUSPENDED', 'Gian hàng đang bị tạm khoá');
    if (store.status === 'VACATION') throw Errors.business('STORE_VACATION', 'Gian hàng đang tạm nghỉ, vui lòng quay lại sau');
    if (store.ownerId === buyer.id) throw Errors.bad('Bạn không thể mua sản phẩm của chính mình');
    if (input.qty < variant.minQty || input.qty > variant.maxQty) {
      throw Errors.bad(`Số lượng phải từ ${variant.minQty} đến ${variant.maxQty}`);
    }
    if (product.deliveryType === 'MANUAL' && product.buyerInputLabel && !input.buyerInput?.trim()) {
      throw Errors.bad(`Vui lòng nhập: ${product.buyerInputLabel}`);
    }

    const total = variant.price * BigInt(input.qty);
    const threshold = await this.settings.get('order.stepUpThreshold');
    if (Number(total) >= threshold && buyer.mfaEnabled) {
      const at = a.session.mfaVerifiedAt?.getTime() ?? 0;
      if (Date.now() - at > 10 * 60_000) throw Errors.mfaRequired();
    }

    const units = product.deliveryType === 'AUTO' ? input.qty * variant.unitsPerPurchase : input.qty;
    const feeBps = await this.feeBpsFor(store.feeOverrideBps, product.categoryId);
    const holdHours = await this.escrow.holdHours(store.level, product.warrantyHours);
    const now = new Date();
    const snapshot = {
      title: product.title,
      variantName: variant.name,
      unitsPerPurchase: variant.unitsPerPurchase,
      warrantyHours: product.warrantyHours,
      deliveryType: product.deliveryType,
      descriptionMd: product.descriptionMd.slice(0, 5000),
      attrs: product.attrs,
      image: product.images[0] ?? null,
      storeName: store.name,
      category: product.category.name,
      stockFormat: product.stockFormat,
    };

    let order: Order;
    try {
      order = await this.prisma.tx(async (tx) => {
        const created = await tx.order.create({
          data: {
            code: `DH${randomCode(8)}`,
            buyerId: buyer.id,
            storeId: store.id,
            sellerId: store.ownerId,
            productId: product.id,
            variantId: variant.id,
            categoryId: product.categoryId,
            status: product.deliveryType === 'AUTO' ? 'DELIVERED' : 'PAID',
            deliveryType: product.deliveryType,
            title: product.title,
            variantName: variant.name,
            qty: input.qty,
            units,
            unitPrice: variant.price,
            total,
            feeBps,
            warrantyHours: product.warrantyHours,
            serviceSlaHours: product.serviceSlaHours,
            productSnapshot: snapshot as Prisma.InputJsonValue,
            buyerInputEnc: input.buyerInput ? this.crypto.encryptField(input.buyerInput.trim(), 'order-input') : null,
            idempotencyKey: idemKey,
            deliveredAt: product.deliveryType === 'AUTO' ? now : null,
          },
        });

        // Trừ tiền người mua -> escrow (khoá tài khoản ví, không cho âm)
        await postLedger(tx, {
          type: 'purchase',
          refType: 'order',
          refId: created.id,
          idempotencyKey: `purchase:${created.id}`,
          description: `Thanh toán đơn ${created.code}`,
          createdById: buyer.id,
          entries: [
            { account: Acct.available(buyer.id), side: 'D', amount: total },
            { account: Acct.escrow(store.ownerId), side: 'C', amount: total },
          ],
        });

        if (product.deliveryType === 'AUTO') {
          // Lấy item kho: SKIP LOCKED để nhiều người mua cùng lúc không bao giờ nhận trùng item
          const items = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM stock_items
            WHERE "productId" = ${product.id}::uuid AND status = 'AVAILABLE'
            ORDER BY "createdAt" ASC
            LIMIT ${units}
            FOR UPDATE SKIP LOCKED`;
          if (items.length < units) {
            throw new AppError('OUT_OF_STOCK', `Không đủ hàng (còn ${items.length} item)`, 409, { available: items.length });
          }
          await tx.stockItem.updateMany({
            where: { id: { in: items.map((i) => i.id) }, status: 'AVAILABLE' },
            data: { status: 'SOLD', orderId: created.id, soldAt: now },
          });
          await tx.$executeRaw`UPDATE products SET "stockTotal" = GREATEST(0, "stockTotal" - ${units}), "soldCount" = "soldCount" + ${input.qty} WHERE id = ${product.id}::uuid`;
        } else {
          await tx.product.update({ where: { id: product.id }, data: { soldCount: { increment: input.qty } } });
        }
        await tx.store.update({ where: { id: store.id }, data: { soldCount: { increment: input.qty } } });

        await tx.escrowHold.create({
          data: {
            orderId: created.id,
            sellerId: store.ownerId,
            amount: total,
            releaseAt: product.deliveryType === 'AUTO' ? new Date(now.getTime() + holdHours * 3600_000) : null,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            type: 'paid',
            actorId: buyer.id,
            message: product.deliveryType === 'AUTO' ? `Đã thanh toán và giao tự động ${units} item` : 'Đã thanh toán, chờ người bán nhận đơn',
          },
        });
        return created;
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const dup = await this.prisma.order.findUnique({ where: { buyerId_idempotencyKey: { buyerId: buyer.id, idempotencyKey: idemKey } } });
        if (dup) return { code: dup.code, status: dup.status, duplicate: true };
      }
      throw e;
    }

    await this.notify.notify(store.ownerId, {
      type: 'order.new',
      title: `Đơn mới ${order.code}: ${product.title}`,
      body: `${input.qty} × ${variant.name} · ${Number(total).toLocaleString('vi-VN')}đ`,
      link: `/seller/don-hang/${order.code}`,
    });
    this.realtime.toUser(store.ownerId, 'order:new', { code: order.code });
    this.realtime.toUser(buyer.id, 'wallet:updated', await this.ledger.balances(buyer.id));
    if (product.deliveryType === 'AUTO') this.realtime.toRoom(`product:${product.id}`, 'stock:updated', { productId: product.id });
    return { code: order.code, status: order.status, duplicate: false };
  }

  // ---------------- Người mua ----------------

  async listForBuyer(userId: string, q: { status?: string; page: number; pageSize: number }) {
    const where: Prisma.OrderWhereInput = { buyerId: userId, ...(q.status ? { status: q.status as any } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { store: { select: { slug: true, name: true } }, escrow: { select: { releaseAt: true, status: true } }, review: { select: { id: true, rating: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: items.map((o) => this.summary(o)), total, page: q.page, pageSize: q.pageSize };
  }

  private summary(o: any) {
    return {
      code: o.code,
      title: o.title,
      variantName: o.variantName,
      qty: o.qty,
      units: o.units,
      total: o.total,
      refundedAmount: o.refundedAmount,
      status: o.status,
      deliveryType: o.deliveryType,
      image: (o.productSnapshot as any)?.image ?? null,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      completedAt: o.completedAt,
      releaseAt: o.escrow?.releaseAt ?? null,
      escrowStatus: o.escrow?.status ?? null,
      store: o.store,
      buyer: o.buyer,
      reviewed: !!o.review,
    };
  }

  private async loadOrder(code: string, where: Prisma.OrderWhereInput) {
    const o = await this.prisma.order.findFirst({
      where: { code, ...where },
      include: {
        store: { select: { id: true, slug: true, name: true, ownerId: true, level: true, avatarUrl: true } },
        buyer: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        escrow: true,
        events: { orderBy: { createdAt: 'asc' } },
        disputes: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'asc' } } } },
        review: true,
      },
    });
    if (!o) throw Errors.notFound('Đơn hàng');
    return o;
  }

  private async detailView(o: Awaited<ReturnType<OrdersService['loadOrder']>>, viewer: 'buyer' | 'seller' | 'staff') {
    const disputeUploads = o.disputes.flatMap((d) => [...d.attachments, ...d.events.flatMap((e) => e.attachments)]);
    const urls = new Map((await this.storage.signedUrls([...disputeUploads, ...o.deliveryUploads])).map((u) => [u.id, u.url]));
    const items =
      o.deliveryType === 'AUTO'
        ? await this.prisma.stockItem.findMany({ where: { orderId: o.id }, select: { id: true, preview: true, status: true }, orderBy: { createdAt: 'asc' } })
        : [];
    return {
      ...this.summary(o),
      id: o.id,
      unitPrice: o.unitPrice,
      feeBps: viewer === 'buyer' ? undefined : o.feeBps,
      feeAmount: viewer === 'buyer' ? undefined : o.feeAmount,
      warrantyHours: o.warrantyHours,
      serviceSlaHours: o.serviceSlaHours,
      serviceDeadline: o.serviceDeadline,
      acceptedAt: o.acceptedAt,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      snapshot: o.productSnapshot,
      productId: o.productId,
      source: o.source,
      buyerInput: o.buyerInputEnc ? this.crypto.decryptField(o.buyerInputEnc, 'order-input') : null,
      deliveryNote: o.deliveryNote,
      deliveryUploads: o.deliveryUploads.map((id) => urls.get(id)).filter(Boolean),
      escrow: o.escrow ? { amount: o.escrow.amount, status: o.escrow.status, releaseAt: o.escrow.releaseAt, releasedAt: o.escrow.releasedAt } : null,
      events: o.events.map((e) => ({ type: e.type, message: e.message, createdAt: e.createdAt })),
      itemsMasked: viewer === 'buyer' ? items.map((i) => ({ id: i.id, status: i.status })) : items,
      review: o.review,
      disputes: o.disputes.map((d) => ({
        id: d.id,
        status: d.status,
        reason: d.reason,
        description: d.description,
        stockItemIds: d.stockItemIds,
        attachments: d.attachments.map((id) => urls.get(id)).filter(Boolean),
        sellerAction: d.sellerAction,
        sellerMessage: d.sellerMessage,
        proposedRefund: d.proposedRefund,
        resolution: d.resolution,
        refundAmount: d.refundAmount,
        sellerDeadline: d.sellerDeadline,
        buyerDeadline: d.buyerDeadline,
        resolutionNote: d.resolutionNote,
        createdAt: d.createdAt,
        resolvedAt: d.resolvedAt,
        events: d.events.map((e) => ({ actorRole: e.actorRole, type: e.type, message: e.message, attachments: e.attachments.map((id) => urls.get(id)).filter(Boolean), createdAt: e.createdAt })),
      })),
    };
  }

  async detailForBuyer(userId: string, code: string) {
    return this.detailView(await this.loadOrder(code, { buyerId: userId }), 'buyer');
  }

  async detailForSeller(storeId: string, code: string) {
    return this.detailView(await this.loadOrder(code, { storeId }), 'seller');
  }

  async detailForStaff(code: string) {
    return this.detailView(await this.loadOrder(code, {}), 'staff');
  }

  /** Giải mã hàng số cho người mua. Mỗi lần xem đều ghi log. */
  async revealItems(a: AuthContext, code: string) {
    await this.rateLimit.enforce(`reveal:${a.user.id}`, 60, 600);
    const order = await this.prisma.order.findFirst({ where: { code, buyerId: a.user.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.deliveryType !== 'AUTO') return { items: [] };
    const items = await this.decryptOrderItems(order.id);
    await this.prisma.stockRevealLog.create({ data: { orderId: order.id, userId: a.user.id, ip: a.ip } });
    return { items, format: (order.productSnapshot as any)?.stockFormat ?? null };
  }

  async decryptOrderItems(orderId: string) {
    const rows = await this.prisma.stockItem.findMany({ where: { orderId }, include: { batch: { select: { id: true, dekWrapped: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => {
      const dek = this.crypto.unwrapDek(r.batch.dekWrapped, r.batch.id);
      return { id: r.id, status: r.status, content: this.crypto.decryptStock(dek, r.id, r.productId, r.contentEnc) };
    });
  }

  async staffRevealItems(staff: AuthContext, code: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { code } });
    if (!order) throw Errors.notFound('Đơn hàng');
    const items = await this.decryptOrderItems(order.id);
    await this.prisma.stockRevealLog.create({ data: { orderId: order.id, userId: staff.user.id, isStaff: true, reason, ip: staff.ip } });
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, userAgent: staff.userAgent, action: 'stock.view_content', targetType: 'order', targetId: order.id, reason });
    return { items };
  }

  async confirm(a: AuthContext, code: string) {
    const order = await this.prisma.order.findFirst({ where: { code, buyerId: a.user.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'DELIVERED') throw Errors.bad('Chỉ xác nhận được đơn đã giao và không có khiếu nại');
    await this.prisma.orderEvent.create({ data: { orderId: order.id, type: 'buyer_confirmed', actorId: a.user.id, message: 'Người mua xác nhận đã nhận hàng, hài lòng' } });
    await this.escrow.releaseNow(order.id, 'buyer_confirmed');
    return { ok: true };
  }

  /** Huỷ & hoàn tiền 100% (đơn dịch vụ chưa nhận, hoặc quá hạn giao). */
  async cancelAndRefund(order: Order, actorId: string | null, reason: string, event: string) {
    await this.prisma.tx(async (tx) => {
      const r = await tx.order.updateMany({ where: { id: order.id, status: { in: ['PAID', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
      if (r.count !== 1) throw Errors.conflict('ORDER_CHANGED', 'Đơn hàng vừa thay đổi trạng thái');
      const hold = await tx.escrowHold.findUniqueOrThrow({ where: { orderId: order.id } });
      if (hold.amount > 0n) {
        await this.escrow.refundInTx(tx, { ...order, status: 'CANCELLED' }, hold.amount, `cancel:${order.id}`, `Hoàn tiền đơn ${order.code}: ${reason}`, actorId);
      }
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: event, actorId, message: reason } });
    });
    await this.notify.notifyMany([order.buyerId, order.sellerId], { type: 'order.cancelled', title: `Đơn ${order.code} đã huỷ và hoàn tiền`, body: reason, link: `/tai-khoan/don-hang/${order.code}` });
    this.realtime.toUser(order.buyerId, 'wallet:updated', await this.ledger.balances(order.buyerId));
  }

  async buyerCancel(a: AuthContext, code: string) {
    const order = await this.prisma.order.findFirst({ where: { code, buyerId: a.user.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.deliveryType !== 'MANUAL') throw Errors.bad('Đơn giao tự động không huỷ được, hãy dùng khiếu nại nếu hàng lỗi');
    const overdue = order.status === 'IN_PROGRESS' && order.serviceDeadline && order.serviceDeadline < new Date();
    if (order.status !== 'PAID' && !overdue) throw Errors.bad('Chỉ huỷ được khi người bán chưa nhận đơn hoặc đã quá hạn giao');
    await this.cancelAndRefund(order, a.user.id, overdue ? 'Người mua huỷ do quá hạn giao' : 'Người mua huỷ trước khi người bán nhận đơn', 'buyer_cancelled');
    return { ok: true };
  }

  // ---------------- Người bán ----------------

  async listForSeller(storeId: string, q: { status?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.OrderWhereInput = {
      storeId,
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q.toUpperCase() } }, { title: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { buyer: { select: { username: true, displayName: true } }, escrow: { select: { releaseAt: true, status: true } } },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], where: { storeId }, _count: true }),
    ]);
    return {
      items: items.map((o) => this.summary(o)),
      total,
      page: q.page,
      pageSize: q.pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    };
  }

  async sellerAccept(a: AuthContext, code: string) {
    const order = await this.prisma.order.findFirst({ where: { code, storeId: a.store!.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'PAID') throw Errors.bad('Đơn không ở trạng thái chờ nhận');
    const deadline = new Date(Date.now() + (order.serviceSlaHours ?? 24) * 3600_000);
    const r = await this.prisma.order.updateMany({ where: { id: order.id, status: 'PAID' }, data: { status: 'IN_PROGRESS', acceptedAt: new Date(), serviceDeadline: deadline } });
    if (!r.count) throw Errors.conflict('ORDER_CHANGED', 'Đơn hàng vừa thay đổi trạng thái');
    await this.prisma.orderEvent.create({ data: { orderId: order.id, type: 'accepted', actorId: a.user.id, message: `Người bán đã nhận đơn, hạn giao ${deadline.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` } });
    await this.notify.notify(order.buyerId, { type: 'order.accepted', title: `Người bán đã nhận đơn ${order.code}`, link: `/tai-khoan/don-hang/${order.code}` });
    return { ok: true };
  }

  async sellerReject(a: AuthContext, code: string, reason: string) {
    const order = await this.prisma.order.findFirst({ where: { code, storeId: a.store!.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'PAID' && order.status !== 'IN_PROGRESS') throw Errors.bad('Không thể từ chối đơn ở trạng thái này');
    await this.cancelAndRefund(order, a.user.id, `Người bán từ chối: ${reason}`, 'seller_rejected');
    return { ok: true };
  }

  async sellerDeliver(a: AuthContext, code: string, input: { note: string; uploadIds: string[] }) {
    const order = await this.prisma.order.findFirst({ where: { code, storeId: a.store!.id } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'IN_PROGRESS') throw Errors.bad('Hãy nhận đơn trước khi giao');
    const uploads = await this.storage.assertOwned(a.user.id, input.uploadIds, ['delivery']);
    const holdHours = await this.escrow.holdHours(a.store!.level, Math.max(order.warrantyHours, 24));
    await this.prisma.tx(async (tx) => {
      const r = await tx.order.updateMany({ where: { id: order.id, status: 'IN_PROGRESS' }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveryNote: input.note, deliveryUploads: uploads.map((u) => u.id) } });
      if (!r.count) throw Errors.conflict('ORDER_CHANGED', 'Đơn hàng vừa thay đổi trạng thái');
      await tx.escrowHold.update({ where: { orderId: order.id }, data: { releaseAt: new Date(Date.now() + holdHours * 3600_000) } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: 'delivered', actorId: a.user.id, message: 'Người bán đã giao, người mua kiểm tra và xác nhận' } });
    });
    await this.notify.notify(order.buyerId, { type: 'order.delivered', title: `Đơn ${order.code} đã được giao`, body: 'Hãy kiểm tra và xác nhận, hoặc khiếu nại nếu có vấn đề.', link: `/tai-khoan/don-hang/${order.code}` });
    return { ok: true };
  }

  // ---------------- Job ----------------

  async processServiceTimeouts() {
    const acceptHours = await this.settings.get('service.acceptHours');
    const notAccepted = await this.prisma.order.findMany({
      where: { status: 'PAID', deliveryType: 'MANUAL', createdAt: { lt: new Date(Date.now() - acceptHours * 3600_000) } },
      take: 100,
    });
    for (const o of notAccepted) {
      await this.cancelAndRefund(o, null, `Người bán không nhận đơn trong ${acceptHours} giờ`, 'auto_cancelled').catch(() => undefined);
    }
    return notAccepted.length;
  }

  openStatuses() {
    return OPEN_STATUSES;
  }
}
