import { Injectable } from '@nestjs/common';
import type { Message, Prisma, User } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { AppError, Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { RealtimeService } from '../../common/realtime.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { StorageService } from '../../common/storage.service';
import { detectOffPlatform } from '../../common/text';
import { publicUser } from '../auth/serialize';

export const SUPPORT_TOPICS: Record<string, string> = {
  deposit: 'Nạp tiền',
  order: 'Đơn hàng',
  withdraw: 'Rút tiền',
  account: 'Tài khoản & bảo mật',
  seller: 'Bán hàng',
  report: 'Báo cáo lừa đảo',
  other: 'Khác',
};

export interface SendInput {
  conversationId: string;
  clientMsgId: string;
  kind: 'TEXT' | 'IMAGE' | 'PRODUCT_CARD' | 'ORDER_CARD';
  body?: string;
  uploadId?: string;
  productId?: string;
  orderCode?: string;
}

type Sender = Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'isStaff' | 'status'>;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly rateLimit: RateLimitService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly notify: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async members(conversationId: string) {
    return this.prisma.conversationMember.findMany({ where: { conversationId } });
  }

  async assertMember(conversationId: string, userId: string) {
    const m = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (!m) throw Errors.notFound('Cuộc trò chuyện');
    return m;
  }

  private async serializeMessages(rows: Message[]) {
    const uploadIds = rows.filter((m) => m.kind === 'IMAGE').map((m) => (m.payload as any)?.uploadId).filter(Boolean);
    const urls = new Map((await this.storage.signedUrls(uploadIds)).map((u) => [u.id, u.url]));
    return rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      clientMsgId: m.clientMsgId,
      kind: m.kind,
      body: m.body,
      payload: m.kind === 'IMAGE' ? { ...(m.payload as object), url: urls.get((m.payload as any)?.uploadId) } : m.payload,
      flags: m.flags,
      createdAt: m.createdAt,
    }));
  }

  async listConversations(userId: string, type?: 'DIRECT' | 'SUPPORT') {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, ...(type ? { conversation: { type } } : {}) },
      include: { conversation: { include: { members: true } } },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
      take: 100,
    });
    const peerIds = [...new Set(memberships.flatMap((m) => m.conversation.members.map((x) => x.userId)).filter((id) => id !== userId))];
    const peers = await this.prisma.user.findMany({ where: { id: { in: peerIds } }, select: { id: true, username: true, displayName: true, avatarUrl: true, isStaff: true, store: { select: { slug: true, name: true, level: true } } } });
    const unread = await Promise.all(
      memberships.map((m) =>
        this.prisma.message.count({ where: { conversationId: m.conversationId, senderId: { not: userId }, createdAt: { gt: m.lastReadAt } } }),
      ),
    );
    const online = peerIds.length ? await this.redis.client.mget(...peerIds.map((id) => `presence:${id}`)) : [];
    const onlineSet = new Set(peerIds.filter((_, i) => online[i]));
    return memberships.map((m, i) => {
      const c = m.conversation;
      const others = c.members.filter((x) => x.userId !== userId).map((x) => {
        const p = peers.find((pp) => pp.id === x.userId);
        return p ? { ...publicUser(p), store: p.store, online: onlineSet.has(p.id), role: x.role } : null;
      }).filter(Boolean);
      return {
        id: c.id,
        type: c.type,
        contextType: c.contextType,
        contextId: c.contextId,
        contextTitle: c.contextTitle,
        supportTopic: c.supportTopic ? SUPPORT_TOPICS[c.supportTopic] ?? c.supportTopic : null,
        supportStatus: c.supportStatus,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unread: unread[i],
        peers: others,
      };
    });
  }

  async unreadTotal(userId: string) {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM messages m JOIN conversation_members cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}::uuid
      WHERE m."senderId" <> ${userId}::uuid AND m."createdAt" > cm."lastReadAt"`;
    return Number(rows[0]?.n ?? 0);
  }

  /** Mở (hoặc lấy lại) cuộc trò chuyện 1-1, kèm ngữ cảnh sản phẩm/đơn hàng/bài đăng. */
  async openDirect(a: AuthContext, peerId: string, context?: { type: 'product' | 'order' | 'post' | 'store'; id: string }) {
    if (peerId === a.user.id) throw Errors.bad('Không thể nhắn tin cho chính mình');
    const peer = await this.prisma.user.findUnique({ where: { id: peerId } });
    if (!peer || peer.status === 'BANNED') throw Errors.notFound('Người dùng');
    const isNew = Date.now() - a.user.createdAt.getTime() < 30 * 24 * 3600_000;
    let ctx: { contextType: string; contextId: string; contextTitle: string } | null = null;
    if (context) {
      if (context.type === 'product') {
        const p = await this.prisma.product.findFirst({ where: { id: context.id, store: { ownerId: { in: [peerId, a.user.id] } } } });
        if (p) ctx = { contextType: 'product', contextId: p.id, contextTitle: p.title };
      } else if (context.type === 'order') {
        const o = await this.prisma.order.findFirst({ where: { code: context.id, OR: [{ buyerId: a.user.id, sellerId: peerId }, { buyerId: peerId, sellerId: a.user.id }] } });
        if (o) ctx = { contextType: 'order', contextId: o.code, contextTitle: `Đơn ${o.code}: ${o.title}` };
      } else if (context.type === 'post') {
        const p = await this.prisma.requestPost.findFirst({ where: { id: context.id, authorId: { in: [peerId, a.user.id] } } });
        if (p) ctx = { contextType: 'post', contextId: p.id, contextTitle: p.title };
      } else if (context.type === 'store') {
        const s = await this.prisma.store.findFirst({ where: { slug: context.id, ownerId: peerId } });
        if (s) ctx = { contextType: 'store', contextId: s.slug, contextTitle: s.name };
      }
    }
    const directKey = [a.user.id, peerId].sort().join(':');
    let conv = await this.prisma.conversation.findUnique({ where: { directKey } });
    if (!conv) {
      if (isNew) await this.rateLimit.enforce(`newconv:${a.user.id}`, 30, 86400);
      conv = await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          ...(ctx ?? {}),
          members: { create: [{ userId: a.user.id, role: 'MEMBER' }, { userId: peerId, role: 'MEMBER' }] },
        },
      });
    } else if (ctx) {
      conv = await this.prisma.conversation.update({ where: { id: conv.id }, data: ctx });
    }
    return { id: conv.id };
  }

  async messages(userId: string, conversationId: string, before?: string, limit = 40, staffView = false) {
    if (!staffView) await this.assertMember(conversationId, userId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { members: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: conv.members.map((m) => m.userId) } }, select: { id: true, username: true, displayName: true, avatarUrl: true, isStaff: true } });
    return {
      conversation: {
        id: conv.id,
        type: conv.type,
        contextType: conv.contextType,
        contextId: conv.contextId,
        contextTitle: conv.contextTitle,
        supportStatus: conv.supportStatus,
        supportTopic: conv.supportTopic ? SUPPORT_TOPICS[conv.supportTopic] ?? conv.supportTopic : null,
        members: conv.members.map((m) => ({ ...publicUser(users.find((u) => u.id === m.userId)!), role: m.role, lastReadAt: m.lastReadAt })),
      },
      items: await this.serializeMessages(page),
      hasMore,
    };
  }

  async send(sender: Sender, input: SendInput) {
    if (await this.settings.killSwitch('chat')) throw Errors.killSwitch('chat');
    if (sender.status !== 'ACTIVE') throw Errors.forbidden('Tài khoản chưa được phép nhắn tin');
    await this.rateLimit.enforce(`msg:${sender.id}`, 20, 10);
    await this.assertMember(input.conversationId, sender.id);
    const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id: input.conversationId } });
    const members = await this.members(conv.id);
    const otherIds = members.map((m) => m.userId).filter((id) => id !== sender.id);

    if (conv.type === 'DIRECT') {
      const blocked = await this.prisma.userBlock.findFirst({ where: { OR: [{ blockerId: { in: otherIds }, blockedId: sender.id }, { blockerId: sender.id, blockedId: { in: otherIds } }] } });
      if (blocked) throw Errors.forbidden('Không thể gửi tin nhắn (đã chặn)');
    }
    if (conv.type === 'SUPPORT' && conv.supportStatus === 'RESOLVED' && !sender.isStaff) {
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { supportStatus: 'QUEUED', assignedStaffId: null } });
      this.realtime.toStaff('support:queued', { conversationId: conv.id });
    }

    let body: string | null = null;
    let payload: Prisma.InputJsonValue | undefined;
    const flags: string[] = [];
    let preview = '';
    switch (input.kind) {
      case 'TEXT': {
        body = (input.body ?? '').trim();
        if (!body) throw Errors.bad('Tin nhắn trống');
        if (body.length > 4000) throw Errors.bad('Tin nhắn tối đa 4000 ký tự');
        if (!sender.isStaff && detectOffPlatform(body)) flags.push('off_platform');
        preview = body.slice(0, 120);
        break;
      }
      case 'IMAGE': {
        if (!input.uploadId) throw Errors.bad('Thiếu ảnh');
        await this.storage.assertOwned(sender.id, [input.uploadId], ['chat']);
        payload = { uploadId: input.uploadId };
        preview = '[Hình ảnh]';
        break;
      }
      case 'PRODUCT_CARD': {
        const p = await this.prisma.product.findFirst({ where: { id: input.productId, status: 'ACTIVE' } });
        if (!p) throw Errors.bad('Sản phẩm không hợp lệ');
        payload = { productId: p.id, title: p.title, priceMin: Number(p.priceMin), image: p.images[0] ?? null };
        preview = `[Sản phẩm] ${p.title}`;
        break;
      }
      case 'ORDER_CARD': {
        const o = await this.prisma.order.findFirst({ where: { code: input.orderCode, OR: [{ buyerId: { in: [sender.id, ...otherIds] }, sellerId: { in: [sender.id, ...otherIds] } }] } });
        if (!o || ![o.buyerId, o.sellerId].includes(sender.id) && !sender.isStaff) throw Errors.bad('Đơn hàng không hợp lệ');
        payload = { orderCode: o.code, title: o.title, total: Number(o.total), status: o.status };
        preview = `[Đơn hàng] ${o.code}`;
        break;
      }
      default:
        throw Errors.bad('Loại tin nhắn không hợp lệ');
    }

    let msg: Message;
    try {
      msg = await this.prisma.message.create({
        data: { conversationId: conv.id, senderId: sender.id, clientMsgId: input.clientMsgId, kind: input.kind, body, payload, flags },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const dup = await this.prisma.message.findUniqueOrThrow({ where: { conversationId_clientMsgId: { conversationId: conv.id, clientMsgId: input.clientMsgId } } });
        return (await this.serializeMessages([dup]))[0];
      }
      throw e;
    }
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: msg.createdAt, lastMessagePreview: preview } });
    await this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: conv.id, userId: sender.id } }, data: { lastReadAt: msg.createdAt } });

    const [view] = await this.serializeMessages([msg]);
    this.realtime.toUsers(members.map((m) => m.userId), 'message:new', { conversationId: conv.id, message: view, sender: publicUser(sender) });
    if (flags.includes('off_platform')) {
      this.realtime.toUsers(members.map((m) => m.userId), 'message:warning', { conversationId: conv.id, messageId: msg.id, type: 'off_platform' });
    }
    if (conv.type === 'SUPPORT' && !sender.isStaff) {
      this.realtime.toStaff('support:message', { conversationId: conv.id, preview, status: conv.supportStatus });
    }
    // Báo người nhận đang offline (gộp tối đa 1 thông báo / 5 phút / cuộc trò chuyện)
    for (const uid of otherIds) {
      const online = await this.redis.client.exists(`presence:${uid}`);
      if (online) continue;
      const k = `msgnotify:${conv.id}:${uid}`;
      if (await this.redis.client.set(k, '1', 'EX', 300, 'NX')) {
        await this.notify.notify(uid, { type: 'message', title: `Tin nhắn mới từ ${sender.displayName}`, body: preview, link: `/tai-khoan/tin-nhan?c=${conv.id}` });
      }
    }
    return view;
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertMember(conversationId, userId);
    const now = new Date();
    await this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: now } });
    const members = await this.members(conversationId);
    this.realtime.toUsers(members.map((m) => m.userId).filter((id) => id !== userId), 'message:read', { conversationId, userId, at: now });
    return { ok: true };
  }

  async typing(userId: string, conversationId: string, isTyping: boolean) {
    const members = await this.members(conversationId);
    if (!members.some((m) => m.userId === userId)) return;
    this.realtime.toUsers(members.map((m) => m.userId).filter((id) => id !== userId), 'typing', { conversationId, userId, isTyping });
  }

  // ---------------- Hỗ trợ ----------------

  async staffOnlineCount() {
    return this.redis.client.zcount('staff:online', Date.now() - 70_000, '+inf');
  }

  async openSupport(a: AuthContext, topic: string, message: string) {
    if (!SUPPORT_TOPICS[topic]) throw Errors.bad('Chủ đề không hợp lệ');
    let conv = await this.prisma.conversation.findFirst({
      where: { type: 'SUPPORT', supportStatus: { in: ['QUEUED', 'ASSIGNED'] }, members: { some: { userId: a.user.id, role: 'MEMBER' } } },
    });
    if (!conv) {
      const lastOrder = await this.prisma.order.findFirst({ where: { OR: [{ buyerId: a.user.id }, { sellerId: a.user.id }] }, orderBy: { createdAt: 'desc' } });
      conv = await this.prisma.conversation.create({
        data: {
          type: 'SUPPORT',
          supportTopic: topic,
          supportStatus: 'QUEUED',
          contextType: lastOrder ? 'order' : null,
          contextId: lastOrder?.code,
          contextTitle: lastOrder ? `Đơn gần nhất: ${lastOrder.code}` : null,
          members: { create: [{ userId: a.user.id, role: 'MEMBER' }] },
        },
      });
      this.realtime.toStaff('support:queued', { conversationId: conv.id, topic: SUPPORT_TOPICS[topic] });
    }
    await this.send(a.user, { conversationId: conv.id, clientMsgId: `support-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'TEXT', body: message });
    const online = await this.staffOnlineCount();
    return { id: conv.id, staffOnline: online, offlineNotice: online === 0 ? 'Hiện chưa có hỗ trợ viên trực tuyến. Chúng tôi sẽ phản hồi sớm nhất (thường trước 9h sáng).' : null };
  }

  async staffQueue(status?: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { type: 'SUPPORT', ...(status ? { supportStatus: status } : { supportStatus: { in: ['QUEUED', 'ASSIGNED'] } }) },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
      include: { members: true },
    });
    const userIds = [...new Set(rows.flatMap((r) => r.members.map((m) => m.userId)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true, avatarUrl: true, isStaff: true, email: true } });
    return rows.map((r) => {
      const customer = users.find((u) => r.members.some((m) => m.userId === u.id && m.role === 'MEMBER'));
      const staff = users.find((u) => u.id === r.assignedStaffId);
      return {
        id: r.id,
        topic: r.supportTopic ? SUPPORT_TOPICS[r.supportTopic] ?? r.supportTopic : null,
        status: r.supportStatus,
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessagePreview,
        contextTitle: r.contextTitle,
        contextId: r.contextId,
        createdAt: r.createdAt,
        waitingSec: r.supportStatus === 'QUEUED' ? Math.round((Date.now() - r.lastMessageAt.getTime()) / 1000) : null,
        customer: customer ? { id: customer.id, username: customer.username, displayName: customer.displayName, avatarUrl: customer.avatarUrl } : null,
        staff: staff ? { id: staff.id, displayName: staff.displayName } : null,
      };
    });
  }

  private async systemMessage(conversationId: string, staffId: string, body: string) {
    const msg = await this.prisma.message.create({ data: { conversationId, senderId: staffId, clientMsgId: `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind: 'SYSTEM', body } });
    const members = await this.members(conversationId);
    const [view] = await this.serializeMessages([msg]);
    this.realtime.toUsers(members.map((m) => m.userId), 'message:new', { conversationId, message: view });
  }

  async staffClaim(staff: AuthContext, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.type !== 'SUPPORT') throw Errors.notFound('Yêu cầu hỗ trợ');
    await this.prisma.$transaction([
      this.prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId, userId: staff.user.id } },
        create: { conversationId, userId: staff.user.id, role: 'STAFF' },
        update: {},
      }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { supportStatus: 'ASSIGNED', assignedStaffId: staff.user.id } }),
    ]);
    await this.systemMessage(conversationId, staff.user.id, `${staff.user.displayName} (hỗ trợ viên) đã tham gia cuộc trò chuyện`);
    this.realtime.toStaff('support:assigned', { conversationId, staffId: staff.user.id });
    return { ok: true };
  }

  async staffResolve(staff: AuthContext, conversationId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.type !== 'SUPPORT') throw Errors.notFound('Yêu cầu hỗ trợ');
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { supportStatus: 'RESOLVED' } });
    await this.systemMessage(conversationId, staff.user.id, 'Yêu cầu hỗ trợ đã được đánh dấu hoàn tất. Bạn có thể nhắn tiếp nếu cần thêm trợ giúp.');
    this.realtime.toStaff('support:resolved', { conversationId });
    return { ok: true };
  }

  /** Admin xem hội thoại 1-1 (chỉ khi có lý do: khiếu nại / báo cáo). Luôn ghi nhật ký. */
  async staffViewDirect(staff: AuthContext, conversationId: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw new AppError('REASON_REQUIRED', 'Cần nhập lý do xem hội thoại', 400);
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, userAgent: staff.userAgent, action: 'chat.view_direct', targetType: 'conversation', targetId: conversationId, reason });
    return this.messages(staff.user.id, conversationId, undefined, 200, true);
  }
}
