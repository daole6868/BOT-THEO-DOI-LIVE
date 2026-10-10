import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AllowUnverified, Auth } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { Z } from '../../common/zod.pipe';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @AllowUnverified()
  @Get()
  async list(@Auth() a: AuthContext, @Query('before') before?: string, @Query('unread') unread?: string) {
    const where = {
      userId: a.user.id,
      ...(unread === '1' ? { readAt: null } : {}),
      ...(before && !isNaN(Date.parse(before)) ? { createdAt: { lt: new Date(before) } } : {}),
    };
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.notification.count({ where: { userId: a.user.id, readAt: null } }),
    ]);
    return { items, unreadCount, nextCursor: items.length === 30 ? items[items.length - 1].createdAt.toISOString() : null };
  }

  @AllowUnverified()
  @Post('read')
  async read(@Auth() a: AuthContext, @Body(Z(z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }))) body: { ids?: string[]; all?: boolean }) {
    await this.prisma.notification.updateMany({
      where: { userId: a.user.id, readAt: null, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
