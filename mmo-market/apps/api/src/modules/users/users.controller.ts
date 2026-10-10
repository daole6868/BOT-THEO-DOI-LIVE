import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AllowUnverified, Auth, Public } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../../common/storage.service';
import { Z } from '../../common/zod.pipe';
import { serializeMe } from '../auth/serialize';

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  bio: z.string().trim().max(300).optional(),
  avatarUploadId: z.string().uuid().nullable().optional(),
});

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @AllowUnverified()
  @Patch('me')
  async updateMe(@Auth() a: AuthContext, @Body(Z(profileSchema)) body: z.infer<typeof profileSchema>) {
    let avatarUrl: string | null | undefined;
    if (body.avatarUploadId) {
      const [u] = await this.storage.assertOwned(a.user.id, [body.avatarUploadId], ['avatar']);
      avatarUrl = this.storage.urlFor(u.key, true);
    } else if (body.avatarUploadId === null) avatarUrl = null;
    const user = await this.prisma.user.update({
      where: { id: a.user.id },
      data: { displayName: body.displayName, bio: body.bio, avatarUrl },
      include: { role: true },
    });
    return serializeMe(user);
  }

  @Public()
  @Get(':username')
  async profile(@Param('username') username: string) {
    const u = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: { store: true },
    });
    if (!u || u.status === 'BANNED') throw Errors.notFound('Người dùng');
    const [posts, orders] = await Promise.all([
      this.prisma.requestPost.count({ where: { authorId: u.id, status: { in: ['OPEN', 'FULFILLED', 'CLOSED', 'EXPIRED'] } } }),
      this.prisma.order.count({ where: { buyerId: u.id, status: 'COMPLETED' } }),
    ]);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      isStaff: u.isStaff,
      createdAt: u.createdAt,
      stats: { posts, completedPurchases: orders },
      store: u.store ? { slug: u.store.slug, name: u.store.name, level: u.store.level } : null,
    };
  }

  @Post(':id/block')
  async block(@Auth() a: AuthContext, @Param('id') id: string) {
    if (id === a.user.id) throw Errors.bad('Không thể tự chặn chính mình');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('Người dùng');
    if (target.isStaff) throw Errors.bad('Không thể chặn nhân viên hỗ trợ');
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: a.user.id, blockedId: id } },
      create: { blockerId: a.user.id, blockedId: id },
      update: {},
    });
    return { ok: true };
  }

  @Delete(':id/block')
  async unblock(@Auth() a: AuthContext, @Param('id') id: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: a.user.id, blockedId: id } });
    return { ok: true };
  }
}
