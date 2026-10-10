import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';

export const REPORT_REASONS: Record<string, string> = {
  SCAM: 'Lừa đảo / gian lận',
  BANNED_ITEM: 'Hàng cấm / vi phạm pháp luật',
  OFF_PLATFORM: 'Rủ giao dịch ngoài sàn',
  SPAM: 'Spam / quảng cáo',
  ABUSE: 'Xúc phạm / quấy rối',
  FAKE_REVIEW: 'Đánh giá giả',
  IMPERSONATION: 'Giả mạo nhân viên / người khác',
  OTHER: 'Khác',
};
export const REPORT_TARGETS = ['PRODUCT', 'POST', 'COMMENT', 'MESSAGE', 'USER', 'STORE', 'REVIEW'] as const;
const AUTO_HIDE_THRESHOLD = 5;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  private async targetExists(type: string, id: string, reporterId: string) {
    switch (type) {
      case 'PRODUCT':
        return !!(await this.prisma.product.findUnique({ where: { id } }));
      case 'POST':
        return !!(await this.prisma.requestPost.findUnique({ where: { id } }));
      case 'COMMENT':
        return !!(await this.prisma.comment.findUnique({ where: { id } }));
      case 'MESSAGE': {
        // Chỉ thành viên cuộc trò chuyện mới báo cáo được tin nhắn
        const m = await this.prisma.message.findUnique({ where: { id } });
        if (!m) return false;
        return !!(await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: m.conversationId, userId: reporterId } } }));
      }
      case 'USER':
        return !!(await this.prisma.user.findUnique({ where: { id } }));
      case 'STORE':
        return !!(await this.prisma.store.findUnique({ where: { id } }));
      case 'REVIEW':
        return !!(await this.prisma.review.findUnique({ where: { id } }));
    }
    return false;
  }

  async create(a: AuthContext, input: { targetType: string; targetId: string; reason: string; detail?: string }) {
    if (!REPORT_REASONS[input.reason]) throw Errors.bad('Lý do không hợp lệ');
    if (!(await this.targetExists(input.targetType, input.targetId, a.user.id))) throw Errors.notFound('Đối tượng báo cáo');
    const dup = await this.prisma.report.findFirst({ where: { reporterId: a.user.id, targetType: input.targetType, targetId: input.targetId, status: 'OPEN' } });
    if (dup) return { ok: true, duplicate: true };
    await this.prisma.report.create({ data: { reporterId: a.user.id, ...input } });
    const open = await this.prisma.report.findMany({ where: { targetType: input.targetType, targetId: input.targetId, status: 'OPEN' }, distinct: ['reporterId'], select: { id: true } });
    if (open.length >= AUTO_HIDE_THRESHOLD) await this.hide(input.targetType, input.targetId);
    this.realtime.toStaff('report:new', { targetType: input.targetType });
    return { ok: true };
  }

  private async hide(type: string, id: string) {
    if (type === 'PRODUCT') await this.prisma.product.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'PENDING_REVIEW', moderationNote: 'Tạm ẩn do nhiều báo cáo' } });
    if (type === 'POST') await this.prisma.requestPost.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'HIDDEN' } });
    if (type === 'COMMENT') await this.prisma.comment.updateMany({ where: { id, status: 'VISIBLE' }, data: { status: 'HIDDEN' } });
    if (type === 'REVIEW') await this.prisma.review.updateMany({ where: { id }, data: { status: 'HIDDEN' } });
  }

  async adminList(status: string, page: number, pageSize: number) {
    const where = { status };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.report.count({ where }),
    ]);
    const reporters = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.reporterId) } }, select: { id: true, username: true, displayName: true } });
    const items = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        reasonLabel: REPORT_REASONS[r.reason] ?? r.reason,
        reporter: reporters.find((u) => u.id === r.reporterId),
        target: await this.preview(r.targetType, r.targetId),
        sameTargetCount: await this.prisma.report.count({ where: { targetType: r.targetType, targetId: r.targetId, status: 'OPEN' } }),
      })),
    );
    return { items, total, page, pageSize };
  }

  private async preview(type: string, id: string) {
    switch (type) {
      case 'PRODUCT': {
        const p = await this.prisma.product.findUnique({ where: { id }, select: { title: true, status: true, store: { select: { name: true, slug: true } } } });
        return p ? { title: p.title, status: p.status, sub: p.store.name, link: `/san-pham/${id}` } : null;
      }
      case 'POST': {
        const p = await this.prisma.requestPost.findUnique({ where: { id }, select: { title: true, status: true } });
        return p ? { title: p.title, status: p.status, link: `/yeu-cau/${id}` } : null;
      }
      case 'COMMENT': {
        const c = await this.prisma.comment.findUnique({ where: { id }, select: { body: true, status: true, postId: true } });
        return c ? { title: c.body.slice(0, 200), status: c.status, link: `/yeu-cau/${c.postId}` } : null;
      }
      case 'MESSAGE': {
        const m = await this.prisma.message.findUnique({ where: { id }, select: { body: true, conversationId: true, senderId: true } });
        return m ? { title: (m.body ?? '[không phải văn bản]').slice(0, 300), conversationId: m.conversationId, senderId: m.senderId } : null;
      }
      case 'USER': {
        const u = await this.prisma.user.findUnique({ where: { id }, select: { username: true, displayName: true, status: true } });
        return u ? { title: `${u.displayName} (@${u.username})`, status: u.status } : null;
      }
      case 'STORE': {
        const s = await this.prisma.store.findUnique({ where: { id }, select: { name: true, slug: true, status: true } });
        return s ? { title: s.name, status: s.status, link: `/shop/${s.slug}` } : null;
      }
      case 'REVIEW': {
        const r = await this.prisma.review.findUnique({ where: { id }, select: { content: true, rating: true, status: true } });
        return r ? { title: `${r.rating}★ ${r.content.slice(0, 200)}`, status: r.status } : null;
      }
    }
    return null;
  }

  async handle(staff: AuthContext, id: string, action: 'DISMISS' | 'HIDE' | 'LOCK_USER', note?: string) {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw Errors.notFound('Báo cáo');
    if (action === 'HIDE') {
      if (r.targetType === 'PRODUCT') await this.prisma.product.update({ where: { id: r.targetId }, data: { status: 'BLOCKED', moderationNote: note ?? 'Vi phạm quy định' } });
      else await this.hide(r.targetType, r.targetId);
    }
    if (action === 'LOCK_USER') {
      const userId =
        r.targetType === 'USER'
          ? r.targetId
          : r.targetType === 'MESSAGE'
            ? (await this.prisma.message.findUnique({ where: { id: r.targetId } }))?.senderId
            : r.targetType === 'COMMENT'
              ? (await this.prisma.comment.findUnique({ where: { id: r.targetId } }))?.authorId
              : r.targetType === 'POST'
                ? (await this.prisma.requestPost.findUnique({ where: { id: r.targetId } }))?.authorId
                : r.targetType === 'STORE'
                  ? (await this.prisma.store.findUnique({ where: { id: r.targetId } }))?.ownerId
                  : undefined;
      if (!userId) throw Errors.bad('Không xác định được người vi phạm');
      const target = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (target.isStaff) throw Errors.forbidden('Không thể khoá nhân sự qua báo cáo');
      await this.prisma.user.update({ where: { id: userId }, data: { status: 'LOCKED' } });
      await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.prisma.report.updateMany({
      where: { targetType: r.targetType, targetId: r.targetId, status: 'OPEN' },
      data: { status: action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', action, handledById: staff.user.id, handleNote: note, handledAt: new Date() },
    });
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: `report.${action.toLowerCase()}`, targetType: r.targetType, targetId: r.targetId, reason: note });
    if (action !== 'DISMISS') await this.notify.notify(r.reporterId, { type: 'report.actioned', title: 'Báo cáo của bạn đã được xử lý. Cảm ơn bạn!' });
    return { ok: true };
  }
}
