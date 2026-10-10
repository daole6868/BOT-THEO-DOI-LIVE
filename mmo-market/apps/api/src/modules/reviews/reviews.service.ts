import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth.types';
import { Errors } from '../../common/errors';
import { KeywordsService } from '../../common/keywords.service';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService, Tx } from '../../common/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
    private readonly keywords: KeywordsService,
  ) {}

  async recompute(tx: Tx, storeId: string, productId: string | null) {
    if (productId) {
      const p = await tx.review.aggregate({ where: { productId, status: 'VISIBLE' }, _avg: { rating: true }, _count: true });
      await tx.product.update({ where: { id: productId }, data: { ratingAvg: Math.round((p._avg.rating ?? 0) * 10) / 10, ratingCount: p._count } });
    }
    const s = await tx.review.aggregate({ where: { storeId, status: 'VISIBLE' }, _avg: { rating: true }, _count: true });
    await tx.store.update({ where: { id: storeId }, data: { ratingAvg: Math.round((s._avg.rating ?? 0) * 10) / 10, ratingCount: s._count } });
  }

  async create(a: AuthContext, code: string, input: { rating: number; content: string }) {
    const order = await this.prisma.order.findFirst({ where: { code, buyerId: a.user.id }, include: { review: true } });
    if (!order) throw Errors.notFound('Đơn hàng');
    if (order.status !== 'COMPLETED') throw Errors.bad('Chỉ đánh giá được đơn đã hoàn tất');
    if (order.review) throw Errors.bad('Bạn đã đánh giá đơn này');
    const kw = await this.keywords.check(input.content);
    const review = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          orderId: order.id,
          buyerId: a.user.id,
          storeId: order.storeId,
          productId: order.productId,
          rating: input.rating,
          content: input.content,
          status: kw.action === 'BLOCK' ? 'HIDDEN' : 'VISIBLE',
        },
      });
      await this.recompute(tx, order.storeId, order.productId);
      return r;
    });
    await this.notify.notify(order.sellerId, { type: 'review.new', title: `Đánh giá ${input.rating}★ cho đơn ${order.code}`, body: input.content.slice(0, 120), link: '/seller/danh-gia' });
    return review;
  }

  async reply(a: AuthContext, reviewId: string, reply: string) {
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r || r.storeId !== a.store!.id) throw Errors.notFound('Đánh giá');
    if (r.sellerReply) throw Errors.bad('Bạn đã phản hồi đánh giá này');
    await this.prisma.review.update({ where: { id: reviewId }, data: { sellerReply: reply, sellerRepliedAt: new Date() } });
    return { ok: true };
  }

  async listForSeller(storeId: string, q: { rating?: number; unreplied?: boolean; page: number; pageSize: number }) {
    const where = { storeId, ...(q.rating ? { rating: q.rating } : {}), ...(q.unreplied ? { sellerReply: null } : {}) };
    const [items, total, dist] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { order: { select: { code: true, title: true, variantName: true, buyer: { select: { displayName: true, username: true } } } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where: { storeId }, _count: true }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, distribution: Object.fromEntries(dist.map((d) => [d.rating, d._count])) };
  }
}
