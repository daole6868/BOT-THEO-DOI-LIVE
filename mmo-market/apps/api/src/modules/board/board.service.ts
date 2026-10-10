import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '../../common/auth.types';
import { randomCode } from '../../common/crypto/crypto';
import { Errors } from '../../common/errors';
import { KeywordsService } from '../../common/keywords.service';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { detectOffPlatform, renderMarkdown, toSearchText } from '../../common/text';
import { publicUser } from '../auth/serialize';
import { Acct, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';
import { OrdersService } from '../orders/orders.service';

const authorSelect = { id: true, username: true, displayName: true, avatarUrl: true, isStaff: true, store: { select: { slug: true, name: true, level: true } } } as const;

export interface PostInput {
  title: string;
  categoryId: string;
  bodyMd: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  quantity?: number | null;
  deadlineDays: number;
  offerVisibility: 'PRIVATE' | 'PUBLIC';
}

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keywords: KeywordsService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
    private readonly ledger: LedgerService,
  ) {}

  // ---------------- Bài đăng ----------------

  async createPost(a: AuthContext, input: PostInput) {
    if (input.budgetMin && input.budgetMax && input.budgetMin > input.budgetMax) throw Errors.bad('Ngân sách tối thiểu lớn hơn tối đa');
    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) throw Errors.bad('Danh mục không hợp lệ');
    const kw = await this.keywords.check(input.title, input.bodyMd);
    if (kw.action === 'BLOCK') throw Errors.business('BANNED_CONTENT', `Nội dung chứa từ khoá bị cấm: ${kw.matched.join(', ')}`);
    const isNew = Date.now() - a.user.createdAt.getTime() < 7 * 24 * 3600_000;
    const daily = await this.prisma.requestPost.count({ where: { authorId: a.user.id, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
    if (daily >= (isNew ? 2 : 10)) throw Errors.business('POST_LIMIT', `Bạn chỉ được đăng ${isNew ? 2 : 10} bài mỗi ngày`);
    const approvedBefore = await this.prisma.requestPost.count({ where: { authorId: a.user.id, status: { in: ['OPEN', 'FULFILLED', 'CLOSED', 'EXPIRED'] } } });
    const needsReview = kw.action === 'REVIEW' || (isNew && approvedBefore === 0) || detectOffPlatform(input.bodyMd);
    const post = await this.prisma.requestPost.create({
      data: {
        authorId: a.user.id,
        categoryId: category.id,
        title: input.title,
        searchText: toSearchText(input.title, category.name),
        bodyMd: input.bodyMd,
        bodyHtml: renderMarkdown(input.bodyMd),
        budgetMin: input.budgetMin != null ? BigInt(input.budgetMin) : null,
        budgetMax: input.budgetMax != null ? BigInt(input.budgetMax) : null,
        quantity: input.quantity ?? null,
        offerVisibility: input.offerVisibility,
        deadlineAt: new Date(Date.now() + input.deadlineDays * 24 * 3600_000),
        status: needsReview ? 'PENDING_REVIEW' : 'OPEN',
      },
    });
    if (needsReview) this.realtime.toStaff('post:pending', { id: post.id });
    return post;
  }

  async listPosts(q: { category?: string; q?: string; status?: string; budgetMin?: number; budgetMax?: number; sort?: string; author?: string; page: number; pageSize: number }, viewerId?: string) {
    const where: Prisma.RequestPostWhereInput = {};
    if (q.author === 'me' && viewerId) where.authorId = viewerId;
    else where.status = q.status ? (q.status as any) : { in: ['OPEN', 'FULFILLED'] };
    if (q.author === 'me' && q.status) where.status = q.status as any;
    if (q.category) {
      const cat = await this.prisma.category.findUnique({ where: { slug: q.category } });
      if (cat) {
        const ids = await this.prisma.category.findMany({ where: { OR: [{ id: cat.id }, { path: { startsWith: cat.path + '/' } }] }, select: { id: true } });
        where.categoryId = { in: ids.map((i) => i.id) };
      }
    }
    if (q.q) where.searchText = { contains: toSearchText(q.q) };
    if (q.budgetMin) where.budgetMax = { gte: BigInt(q.budgetMin) };
    if (q.budgetMax) where.budgetMin = { lte: BigInt(q.budgetMax) };
    const orderBy: Prisma.RequestPostOrderByWithRelationInput =
      q.sort === 'most_offers' ? { offerCount: 'desc' } : q.sort === 'ending_soon' ? { deadlineAt: 'asc' } : q.sort === 'most_comments' ? { commentCount: 'desc' } : { createdAt: 'desc' };
    const [items, total] = await Promise.all([
      this.prisma.requestPost.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { author: { select: authorSelect } },
      }),
      this.prisma.requestPost.count({ where }),
    ]);
    const cats = await this.prisma.category.findMany({ where: { id: { in: [...new Set(items.map((i) => i.categoryId))] } }, select: { id: true, name: true, slug: true } });
    return {
      items: items.map((p) => ({
        id: p.id,
        title: p.title,
        excerpt: p.bodyMd.slice(0, 180),
        budgetMin: p.budgetMin,
        budgetMax: p.budgetMax,
        quantity: p.quantity,
        status: p.status,
        deadlineAt: p.deadlineAt,
        commentCount: p.commentCount,
        offerCount: p.offerCount,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        category: cats.find((c) => c.id === p.categoryId),
        author: { ...publicUser(p.author), store: p.author.store },
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async getPost(id: string, viewer?: AuthContext) {
    const p = await this.prisma.requestPost.findUnique({ where: { id }, include: { author: { select: authorSelect } } });
    if (!p) throw Errors.notFound('Bài đăng');
    const isAuthor = viewer?.user.id === p.authorId;
    if ((p.status === 'HIDDEN' || p.status === 'PENDING_REVIEW') && !isAuthor) throw Errors.notFound('Bài đăng');
    const key = `postview:${id}:${viewer?.user.id ?? viewer?.ip ?? 'anon'}`;
    if (await this.redis.client.set(key, '1', 'EX', 3600, 'NX')) {
      await this.prisma.requestPost.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    }
    const category = await this.prisma.category.findUnique({ where: { id: p.categoryId }, select: { id: true, name: true, slug: true } });
    let myOffer = null;
    if (viewer) {
      const store = await this.prisma.store.findUnique({ where: { ownerId: viewer.user.id } });
      if (store) myOffer = await this.prisma.offer.findUnique({ where: { postId_storeId: { postId: id, storeId: store.id } } });
    }
    return {
      id: p.id,
      title: p.title,
      bodyHtml: p.bodyHtml,
      bodyMd: isAuthor ? p.bodyMd : undefined,
      budgetMin: p.budgetMin,
      budgetMax: p.budgetMax,
      quantity: p.quantity,
      status: p.status,
      offerVisibility: p.offerVisibility,
      deadlineAt: p.deadlineAt,
      commentCount: p.commentCount,
      offerCount: p.offerCount,
      viewCount: p.viewCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      acceptedOfferId: p.acceptedOfferId,
      category,
      author: { ...publicUser(p.author), store: p.author.store },
      isAuthor,
      myOffer,
    };
  }

  async updatePost(a: AuthContext, id: string, input: Partial<PostInput>) {
    const p = await this.prisma.requestPost.findUnique({ where: { id } });
    if (!p || p.authorId !== a.user.id) throw Errors.notFound('Bài đăng');
    if (!['OPEN', 'PENDING_REVIEW'].includes(p.status)) throw Errors.bad('Bài đã đóng, không sửa được');
    const kw = await this.keywords.check(input.title, input.bodyMd);
    if (kw.action === 'BLOCK') throw Errors.business('BANNED_CONTENT', `Nội dung chứa từ khoá bị cấm: ${kw.matched.join(', ')}`);
    return this.prisma.requestPost.update({
      where: { id },
      data: {
        title: input.title,
        bodyMd: input.bodyMd,
        bodyHtml: input.bodyMd ? renderMarkdown(input.bodyMd) : undefined,
        searchText: input.title ? toSearchText(input.title) : undefined,
        budgetMin: input.budgetMin !== undefined ? (input.budgetMin != null ? BigInt(input.budgetMin) : null) : undefined,
        budgetMax: input.budgetMax !== undefined ? (input.budgetMax != null ? BigInt(input.budgetMax) : null) : undefined,
        quantity: input.quantity,
        offerVisibility: input.offerVisibility,
        status: kw.action === 'REVIEW' ? 'PENDING_REVIEW' : undefined,
      },
    });
  }

  async closePost(a: AuthContext, id: string) {
    const r = await this.prisma.requestPost.updateMany({ where: { id, authorId: a.user.id, status: { in: ['OPEN', 'PENDING_REVIEW'] } }, data: { status: 'CLOSED' } });
    if (!r.count) throw Errors.bad('Không thể đóng bài này');
    return { ok: true };
  }

  async extendPost(a: AuthContext, id: string, days: number) {
    const p = await this.prisma.requestPost.findUnique({ where: { id } });
    if (!p || p.authorId !== a.user.id) throw Errors.notFound('Bài đăng');
    if (!['OPEN', 'EXPIRED'].includes(p.status)) throw Errors.bad('Không thể gia hạn bài này');
    const base = p.deadlineAt > new Date() ? p.deadlineAt : new Date();
    return this.prisma.requestPost.update({ where: { id }, data: { deadlineAt: new Date(base.getTime() + days * 24 * 3600_000), status: 'OPEN' } });
  }

  // ---------------- Bình luận (2 cấp) ----------------

  private serializeComment(c: any, likedIds: Set<string>, postAuthorId: string) {
    const deleted = c.status !== 'VISIBLE';
    return {
      id: c.id,
      postId: c.postId,
      parentId: c.parentId,
      rootId: c.rootId,
      depth: c.depth,
      body: deleted ? null : c.body,
      status: c.status,
      likeCount: c.likeCount,
      replyCount: c.replyCount,
      liked: likedIds.has(c.id),
      editedAt: c.editedAt,
      createdAt: c.createdAt,
      isPostAuthor: c.authorId === postAuthorId,
      author: deleted ? null : { ...publicUser(c.author), store: c.author.store },
      replyTo: c.replyTo ? { id: c.replyTo.id, username: c.replyTo.username, displayName: c.replyTo.displayName } : null,
    };
  }

  private async withReplyTo(rows: any[]) {
    const ids = [...new Set(rows.map((r) => r.replyToUserId).filter(Boolean))] as string[];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true } }) : [];
    return rows.map((r) => ({ ...r, replyTo: users.find((u) => u.id === r.replyToUserId) ?? null }));
  }

  private async likedSet(viewerId: string | undefined, ids: string[]) {
    if (!viewerId || !ids.length) return new Set<string>();
    const likes = await this.prisma.commentLike.findMany({ where: { userId: viewerId, commentId: { in: ids } }, select: { commentId: true } });
    return new Set(likes.map((l) => l.commentId));
  }

  async listComments(postId: string, viewerId: string | undefined, cursor: string | undefined, limit = 20) {
    const post = await this.prisma.requestPost.findUnique({ where: { id: postId } });
    if (!post) throw Errors.notFound('Bài đăng');
    const roots = await this.prisma.comment.findMany({
      where: { postId, depth: 0, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { author: { select: authorSelect } },
    });
    const hasMore = roots.length > limit;
    const page = roots.slice(0, limit);
    const replies = page.length
      ? await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM (
            SELECT id, row_number() OVER (PARTITION BY "rootId" ORDER BY "createdAt" ASC) AS rn
            FROM comments WHERE "rootId" = ANY(${page.map((r) => r.id)}::uuid[]) AND depth = 1
          ) t WHERE rn <= 3`
      : [];
    const replyRows = replies.length
      ? await this.prisma.comment.findMany({ where: { id: { in: replies.map((r) => r.id) } }, orderBy: { createdAt: 'asc' }, include: { author: { select: authorSelect } } })
      : [];
    const all = await this.withReplyTo([...page, ...replyRows]);
    const liked = await this.likedSet(viewerId, all.map((c) => c.id));
    const map = new Map(all.map((c) => [c.id, c]));
    return {
      items: page.map((r) => ({
        ...this.serializeComment(map.get(r.id), liked, post.authorId),
        replies: replyRows.filter((x) => x.rootId === r.id).map((x) => this.serializeComment(map.get(x.id), liked, post.authorId)),
      })),
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  async listReplies(rootId: string, viewerId: string | undefined, after: string | undefined, limit = 20) {
    const root = await this.prisma.comment.findUnique({ where: { id: rootId }, include: { post: true } });
    if (!root) throw Errors.notFound('Bình luận');
    const rows = await this.prisma.comment.findMany({
      where: { rootId, depth: 1, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: { author: { select: authorSelect } },
    });
    const hasMore = rows.length > limit;
    const page = await this.withReplyTo(rows.slice(0, limit));
    const liked = await this.likedSet(viewerId, page.map((c) => c.id));
    return {
      items: page.map((c) => this.serializeComment(c, liked, root.post.authorId)),
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  async createComment(a: AuthContext, postId: string, body: string, parentId?: string) {
    const post = await this.prisma.requestPost.findUnique({ where: { id: postId } });
    if (!post || post.status === 'HIDDEN' || post.status === 'PENDING_REVIEW') throw Errors.notFound('Bài đăng');
    if (post.status !== 'OPEN' && post.status !== 'FULFILLED') throw Errors.bad('Bài đã đóng bình luận');
    const kw = await this.keywords.check(body);
    if (kw.action === 'BLOCK') throw Errors.business('BANNED_CONTENT', `Bình luận chứa từ khoá bị cấm: ${kw.matched.join(', ')}`);
    const isNew = Date.now() - a.user.createdAt.getTime() < 3 * 24 * 3600_000;
    if (isNew && /https?:\/\/|www\./i.test(body)) throw Errors.business('LINK_NOT_ALLOWED', 'Tài khoản mới chưa được chèn liên kết');

    let parent = null as null | { id: string; depth: number; rootId: string | null; authorId: string };
    if (parentId) {
      parent = await this.prisma.comment.findFirst({ where: { id: parentId, postId }, select: { id: true, depth: true, rootId: true, authorId: true } });
      if (!parent) throw Errors.notFound('Bình luận được trả lời');
    }
    const rootId = parent ? (parent.depth === 0 ? parent.id : parent.rootId!) : null;
    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          postId,
          authorId: a.user.id,
          parentId: parent?.id ?? null,
          rootId,
          replyToUserId: parent && parent.depth === 1 ? parent.authorId : null,
          depth: parent ? 1 : 0,
          body,
        },
        include: { author: { select: authorSelect } },
      });
      if (!rootId) await tx.comment.update({ where: { id: c.id }, data: { rootId: c.id } });
      else await tx.comment.update({ where: { id: rootId }, data: { replyCount: { increment: 1 } } });
      await tx.requestPost.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
      return { ...c, rootId: rootId ?? c.id };
    });

    // Thông báo: chủ bài, người được trả lời, người được @nhắc
    const toNotify = new Map<string, string>();
    if (post.authorId !== a.user.id) toNotify.set(post.authorId, `${a.user.displayName} đã bình luận bài "${post.title.slice(0, 60)}"`);
    if (parent && parent.authorId !== a.user.id) toNotify.set(parent.authorId, `${a.user.displayName} đã trả lời bình luận của bạn`);
    const mentions = [...body.matchAll(/@([a-z0-9_.]{3,24})/gi)].map((m) => m[1].toLowerCase()).slice(0, 5);
    if (mentions.length) {
      const users = await this.prisma.user.findMany({ where: { username: { in: mentions } }, select: { id: true } });
      for (const u of users) if (u.id !== a.user.id && !toNotify.has(u.id)) toNotify.set(u.id, `${a.user.displayName} đã nhắc đến bạn trong một bình luận`);
    }
    for (const [uid, title] of toNotify) {
      await this.notify.notify(uid, { type: 'comment', title, body: body.slice(0, 140), link: `/yeu-cau/${postId}#c-${comment.id}` });
    }
    const [withReply] = await this.withReplyTo([comment]);
    const view = this.serializeComment(withReply, new Set(), post.authorId);
    this.realtime.toRoom(`post:${postId}`, 'comment:new', view);
    return view;
  }

  async editComment(a: AuthContext, id: string, body: string) {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c || c.authorId !== a.user.id || c.status !== 'VISIBLE') throw Errors.notFound('Bình luận');
    const kw = await this.keywords.check(body);
    if (kw.action === 'BLOCK') throw Errors.business('BANNED_CONTENT', 'Bình luận chứa từ khoá bị cấm');
    return this.prisma.comment.update({ where: { id }, data: { body, editedAt: new Date() } });
  }

  async deleteComment(a: AuthContext, id: string) {
    const r = await this.prisma.comment.updateMany({ where: { id, authorId: a.user.id, status: 'VISIBLE' }, data: { status: 'DELETED' } });
    if (!r.count) throw Errors.notFound('Bình luận');
    return { ok: true };
  }

  async toggleLike(a: AuthContext, id: string, on: boolean) {
    const c = await this.prisma.comment.findUnique({ where: { id } });
    if (!c) throw Errors.notFound('Bình luận');
    if (on) {
      const r = await this.prisma.commentLike.createMany({ data: [{ commentId: id, userId: a.user.id }], skipDuplicates: true });
      if (r.count) await this.prisma.comment.update({ where: { id }, data: { likeCount: { increment: 1 } } });
    } else {
      const r = await this.prisma.commentLike.deleteMany({ where: { commentId: id, userId: a.user.id } });
      if (r.count) await this.prisma.comment.update({ where: { id }, data: { likeCount: { decrement: 1 } } });
    }
    return { liked: on };
  }

  // ---------------- Báo giá ----------------

  async listOffers(postId: string, viewer?: AuthContext) {
    const post = await this.prisma.requestPost.findUnique({ where: { id: postId } });
    if (!post) throw Errors.notFound('Bài đăng');
    const isAuthor = viewer?.user.id === post.authorId;
    const rows = await this.prisma.offer.findMany({
      where: { postId, status: { in: ['PENDING', 'ACCEPTED'] } },
      orderBy: [{ status: 'asc' }, { price: 'asc' }],
      include: { store: { select: { id: true, slug: true, name: true, level: true, ratingAvg: true, ratingCount: true, completedOrders: true, avatarUrl: true, ownerId: true } } },
    });
    const canSeePrice = isAuthor || post.offerVisibility === 'PUBLIC';
    return {
      canSeePrice,
      items: rows.map((o) => ({
        id: o.id,
        status: o.status,
        price: canSeePrice || o.store.ownerId === viewer?.user.id ? o.price : null,
        deliveryHours: o.deliveryHours,
        message: canSeePrice || o.store.ownerId === viewer?.user.id ? o.message : null,
        productId: o.productId,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        store: o.store,
        mine: o.store.ownerId === viewer?.user.id,
      })),
    };
  }

  async upsertOffer(a: AuthContext, postId: string, input: { price: number; deliveryHours: number; message: string; productId?: string }) {
    const store = await this.prisma.store.findUnique({ where: { ownerId: a.user.id } });
    if (!store) throw Errors.forbidden('Chỉ người bán mới gửi báo giá được');
    if (store.status !== 'ACTIVE') throw Errors.forbidden('Gian hàng không ở trạng thái hoạt động');
    if (!a.user.mfaEnabled) throw Errors.mfaSetupRequired();
    const post = await this.prisma.requestPost.findUnique({ where: { id: postId } });
    if (!post || post.status !== 'OPEN') throw Errors.bad('Bài không còn nhận báo giá');
    if (post.authorId === a.user.id) throw Errors.bad('Không thể báo giá bài của chính mình');
    if (input.productId) {
      const p = await this.prisma.product.findFirst({ where: { id: input.productId, storeId: store.id, status: 'ACTIVE' } });
      if (!p) throw Errors.bad('Sản phẩm gợi ý không hợp lệ');
    }
    const kw = await this.keywords.check(input.message);
    if (kw.action === 'BLOCK') throw Errors.business('BANNED_CONTENT', 'Báo giá chứa từ khoá bị cấm');
    const existing = await this.prisma.offer.findUnique({ where: { postId_storeId: { postId, storeId: store.id } } });
    if (existing && existing.status === 'ACCEPTED') throw Errors.bad('Báo giá đã được chấp nhận');
    const offer = await this.prisma.$transaction(async (tx) => {
      const o = await tx.offer.upsert({
        where: { postId_storeId: { postId, storeId: store.id } },
        create: { postId, storeId: store.id, sellerId: a.user.id, price: BigInt(input.price), deliveryHours: input.deliveryHours, message: input.message, productId: input.productId },
        update: { price: BigInt(input.price), deliveryHours: input.deliveryHours, message: input.message, productId: input.productId, status: 'PENDING' },
      });
      if (!existing || existing.status === 'WITHDRAWN') await tx.requestPost.update({ where: { id: postId }, data: { offerCount: { increment: 1 } } });
      return o;
    });
    await this.notify.notify(post.authorId, {
      type: 'offer.new',
      title: `${existing ? 'Cập nhật' : 'Báo giá mới'} từ ${store.name}`,
      body: `${input.price.toLocaleString('vi-VN')}đ · giao trong ${input.deliveryHours} giờ`,
      link: `/yeu-cau/${postId}?tab=offers`,
    });
    return offer;
  }

  async withdrawOffer(a: AuthContext, offerId: string) {
    const o = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!o || o.sellerId !== a.user.id) throw Errors.notFound('Báo giá');
    if (o.status !== 'PENDING') throw Errors.bad('Không thể rút báo giá này');
    await this.prisma.$transaction([
      this.prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } }),
      this.prisma.requestPost.update({ where: { id: o.postId }, data: { offerCount: { decrement: 1 } } }),
    ]);
    return { ok: true };
  }

  /** Chủ bài chấp nhận báo giá -> tạo đơn dịch vụ (tiền vào escrow). */
  async acceptOffer(a: AuthContext, offerId: string, idemKey: string) {
    if (await this.settings.killSwitch('orders')) throw Errors.killSwitch('đặt hàng');
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { post: true, store: true } });
    if (!offer || offer.post.authorId !== a.user.id) throw Errors.notFound('Báo giá');
    const existingOrder = await this.prisma.order.findUnique({ where: { buyerId_idempotencyKey: { buyerId: a.user.id, idempotencyKey: idemKey } } });
    if (existingOrder) return { code: existingOrder.code, duplicate: true };
    if (offer.status !== 'PENDING' || offer.post.status !== 'OPEN') throw Errors.bad('Báo giá không còn hiệu lực');
    if (offer.store.status !== 'ACTIVE') throw Errors.business('STORE_UNAVAILABLE', 'Gian hàng hiện không nhận đơn');
    const feeBps = await this.orders.feeBpsFor(offer.store.feeOverrideBps, offer.post.categoryId);
    const total = offer.price;
    const now = new Date();
    const order = await this.prisma.tx(async (tx) => {
      const r = await tx.offer.updateMany({ where: { id: offer.id, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
      if (!r.count) throw Errors.conflict('OFFER_CHANGED', 'Báo giá vừa thay đổi');
      const o = await tx.order.create({
        data: {
          code: `DH${randomCode(8)}`,
          buyerId: a.user.id,
          storeId: offer.storeId,
          sellerId: offer.sellerId,
          productId: offer.productId,
          categoryId: offer.post.categoryId,
          source: 'OFFER',
          offerId: offer.id,
          requestPostId: offer.postId,
          status: 'IN_PROGRESS',
          deliveryType: 'MANUAL',
          title: offer.post.title,
          variantName: 'Theo báo giá',
          qty: 1,
          units: 1,
          unitPrice: total,
          total,
          feeBps,
          warrantyHours: offer.store.defaultWarrantyHours,
          serviceSlaHours: offer.deliveryHours,
          serviceDeadline: new Date(now.getTime() + offer.deliveryHours * 3600_000),
          acceptedAt: now,
          productSnapshot: { title: offer.post.title, offerMessage: offer.message, storeName: offer.store.name, deliveryHours: offer.deliveryHours, requestBody: offer.post.bodyMd.slice(0, 3000) },
          idempotencyKey: idemKey,
        },
      });
      await postLedger(tx, {
        type: 'purchase',
        refType: 'order',
        refId: o.id,
        idempotencyKey: `purchase:${o.id}`,
        description: `Thanh toán đơn ${o.code} (báo giá)`,
        createdById: a.user.id,
        entries: [
          { account: Acct.available(a.user.id), side: 'D', amount: total },
          { account: Acct.escrow(offer.sellerId), side: 'C', amount: total },
        ],
      });
      await tx.escrowHold.create({ data: { orderId: o.id, sellerId: offer.sellerId, amount: total, releaseAt: null } });
      await tx.offer.update({ where: { id: offer.id }, data: { orderId: o.id } });
      await tx.offer.updateMany({ where: { postId: offer.postId, id: { not: offer.id }, status: 'PENDING' }, data: { status: 'DECLINED' } });
      await tx.requestPost.update({ where: { id: offer.postId }, data: { status: 'FULFILLED', acceptedOfferId: offer.id } });
      await tx.orderEvent.create({ data: { orderId: o.id, type: 'paid', actorId: a.user.id, message: 'Người mua chấp nhận báo giá và thanh toán. Người bán bắt đầu thực hiện.' } });
      return o;
    });
    await this.notify.notify(offer.sellerId, { type: 'offer.accepted', title: `Báo giá được chấp nhận: đơn ${order.code}`, body: `${Number(total).toLocaleString('vi-VN')}đ`, link: `/seller/don-hang/${order.code}` });
    this.realtime.toUser(a.user.id, 'wallet:updated', await this.ledger.balances(a.user.id));
    return { code: order.code, duplicate: false };
  }

  async sellerOffers(sellerId: string) {
    const rows = await this.prisma.offer.findMany({ where: { sellerId }, orderBy: { updatedAt: 'desc' }, take: 100, include: { post: { select: { id: true, title: true, status: true, deadlineAt: true } } } });
    const stats = await this.prisma.offer.groupBy({ by: ['status'], where: { sellerId }, _count: true });
    return { items: rows, stats: Object.fromEntries(stats.map((s) => [s.status, s._count])) };
  }

  async expirePosts() {
    const r = await this.prisma.requestPost.updateMany({ where: { status: 'OPEN', deadlineAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
    return r.count;
  }
}
