import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { Z } from '../../common/zod.pipe';
import { DisputesService } from '../disputes/disputes.service';
import { OrdersService } from '../orders/orders.service';

const uuid = (v: string) => z.string().uuid().parse(v);

@AdminArea()
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  @Perm('product.moderate')
  @Get()
  async list(@Query() q: Record<string, string>) {
    const p = z
      .object({ status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'HIDDEN', 'REJECTED', 'BLOCKED']).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })
      .parse(q);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(p.status ? { status: p.status } : {}),
      ...(p.q ? { OR: [{ title: { contains: p.q, mode: 'insensitive' } }, { store: { name: { contains: p.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: p.status === 'PENDING_REVIEW' ? 'asc' : 'desc' },
        skip: (p.page - 1) * 20,
        take: 20,
        include: { store: { select: { name: true, slug: true, level: true } }, category: { select: { name: true } }, variants: { select: { name: true, price: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: 20 };
  }

  @Perm('product.moderate')
  @Post(':id/moderate')
  async moderate(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ action: z.enum(['approve', 'reject', 'block', 'unblock']), note: z.string().max(500).optional() }))) body: { action: string; note?: string }) {
    const p = await this.prisma.product.findUnique({ where: { id: uuid(id) }, include: { store: true } });
    if (!p) throw Errors.notFound('Sản phẩm');
    if (body.action !== 'approve' && body.action !== 'unblock' && !body.note) throw Errors.bad('Nhập lý do');
    const status = body.action === 'approve' || body.action === 'unblock' ? 'ACTIVE' : body.action === 'reject' ? 'REJECTED' : 'BLOCKED';
    await this.prisma.product.update({ where: { id: p.id }, data: { status, moderationNote: body.note ?? null, approvedAt: status === 'ACTIVE' ? (p.approvedAt ?? new Date()) : p.approvedAt } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `product.${body.action}`, targetType: 'product', targetId: p.id, reason: body.note });
    const titles: Record<string, string> = { approve: 'đã được duyệt', reject: 'bị từ chối', block: 'bị khoá', unblock: 'đã được mở khoá' };
    await this.notify.notify(p.store.ownerId, { type: `product.${body.action}`, title: `Sản phẩm "${p.title.slice(0, 50)}" ${titles[body.action]}`, body: body.note, link: `/seller/san-pham/${p.id}` });
    return { ok: true };
  }
}

@AdminArea()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Perm('order.view')
  @Get()
  async list(@Query() q: Record<string, string>) {
    const p = z
      .object({ status: z.enum(['PAID', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'REFUNDED', 'CANCELLED']).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })
      .parse(q);
    const where: Prisma.OrderWhereInput = {
      ...(p.status ? { status: p.status } : {}),
      ...(p.q ? { OR: [{ code: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' } }, { buyer: { username: { contains: p.q.toLowerCase() } } }, { store: { name: { contains: p.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * 20,
        take: 20,
        include: { buyer: { select: { username: true } }, store: { select: { name: true, slug: true } }, escrow: { select: { status: true, releaseAt: true, amount: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page: p.page, pageSize: 20 };
  }

  @Perm('order.view')
  @Get(':code')
  detail(@Param('code') code: string) {
    return this.orders.detailForStaff(code);
  }

  @Perm('stock.view_content')
  @Post(':code/reveal')
  reveal(@Auth() a: AuthContext, @Param('code') code: string, @Body(Z(z.object({ reason: z.string().trim().min(10, 'Lý do tối thiểu 10 ký tự').max(500) }))) body: { reason: string }) {
    return this.orders.staffRevealItems(a, code, body.reason);
  }
}

@AdminArea()
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Perm('dispute.resolve')
  @Get()
  list(@Query('status') status?: string, @Query('page') page = '1') {
    return this.disputes.adminList(['OPEN', 'SELLER_RESPONDED', 'ESCALATED', 'RESOLVED'].includes(status ?? '') ? status : undefined, Math.max(1, Number(page) || 1), 20);
  }

  @Perm('dispute.resolve')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.disputes.adminDetail(uuid(id));
  }

  @Perm('dispute.resolve')
  @Post(':id/message')
  message(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ message: z.string().trim().min(2).max(2000) }))) body: { message: string }) {
    return this.disputes.adminMessage(a, uuid(id), body.message);
  }

  @Perm('dispute.resolve')
  @Post(':id/resolve')
  async resolve(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ resolution: z.enum(['REFUND_FULL', 'REFUND_PARTIAL', 'REJECTED']), amount: z.number().int().positive().optional(), note: z.string().trim().min(5).max(2000) })))
    body: { resolution: 'REFUND_FULL' | 'REFUND_PARTIAL' | 'REJECTED'; amount?: number; note: string },
  ) {
    const d = await this.disputes.adminDetail(uuid(id));
    const big = Number(d.order.total) > 2_000_000;
    if (big && !(a.user.role?.permissions.includes('*') || a.user.role?.name === 'ADMIN')) {
      throw Errors.forbidden('Khiếu nại trên 2 triệu cần Admin phân xử');
    }
    return this.disputes.adminResolve(a, uuid(id), body);
  }
}
