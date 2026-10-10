import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { KeywordsService } from '../../common/keywords.service';
import { hashPassword, passwordProblems } from '../../common/password';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../common/prisma.service';
import { SETTING_DEFAULTS, SettingKey, SettingsService } from '../../common/settings.service';
import { Z } from '../../common/zod.pipe';

const uuid = (v: string) => z.string().uuid().parse(v);

@AdminArea()
@Controller('admin/community')
export class AdminCommunityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keywords: KeywordsService,
  ) {}

  @Perm('community.moderate')
  @Get('posts')
  async posts(@Query('status') status = 'PENDING_REVIEW', @Query('page') page = '1') {
    const p = Math.max(1, Number(page) || 1);
    const where = { status: status as any };
    const [items, total] = await Promise.all([
      this.prisma.requestPost.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (p - 1) * 20, take: 20, include: { author: { select: { username: true, displayName: true, createdAt: true } } } }),
      this.prisma.requestPost.count({ where }),
    ]);
    return { items, total, page: p, pageSize: 20 };
  }

  @Perm('community.moderate')
  @Post('posts/:id/moderate')
  async moderatePost(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ action: z.enum(['approve', 'hide', 'restore']), note: z.string().max(500).optional() }))) body: { action: string; note?: string }) {
    const status = body.action === 'hide' ? 'HIDDEN' : 'OPEN';
    await this.prisma.requestPost.update({ where: { id: uuid(id) }, data: { status } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `post.${body.action}`, targetType: 'post', targetId: id, reason: body.note });
    return { ok: true };
  }

  @Perm('community.moderate')
  @Get('comments')
  async comments(@Query('status') status = 'HIDDEN') {
    return this.prisma.comment.findMany({ where: { status: status as any }, orderBy: { createdAt: 'desc' }, take: 100, include: { author: { select: { username: true, displayName: true } }, post: { select: { id: true, title: true } } } });
  }

  @Perm('community.moderate')
  @Post('comments/:id/moderate')
  async moderateComment(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ action: z.enum(['hide', 'restore']), note: z.string().max(500).optional() }))) body: { action: string; note?: string }) {
    await this.prisma.comment.update({ where: { id: uuid(id) }, data: { status: body.action === 'hide' ? 'HIDDEN' : 'VISIBLE' } });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `comment.${body.action}`, targetType: 'comment', targetId: id, reason: body.note });
    return { ok: true };
  }

  @Perm('community.moderate')
  @Get('keywords')
  listKeywords() {
    return this.prisma.bannedKeyword.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Perm('community.moderate')
  @Post('keywords')
  async addKeyword(@Auth() a: AuthContext, @Body(Z(z.object({ pattern: z.string().trim().min(2).max(60), action: z.enum(['BLOCK', 'REVIEW']), note: z.string().max(200).optional() }))) body: { pattern: string; action: string; note?: string }) {
    const k = await this.prisma.bannedKeyword.create({ data: { ...body, pattern: body.pattern.toLowerCase() } });
    this.keywords.invalidate();
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'keyword.add', targetType: 'keyword', targetId: k.id, data: body });
    return k;
  }

  @Perm('community.moderate')
  @Delete('keywords/:id')
  async removeKeyword(@Auth() a: AuthContext, @Param('id') id: string) {
    await this.prisma.bannedKeyword.delete({ where: { id: uuid(id) } });
    this.keywords.invalidate();
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'keyword.remove', targetType: 'keyword', targetId: id });
    return { ok: true };
  }
}

@AdminArea()
@Controller('admin/staff')
export class AdminStaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Perm('staff.manage')
  @Get()
  async list() {
    const [staff, roles] = await Promise.all([
      this.prisma.user.findMany({ where: { isStaff: true }, orderBy: { createdAt: 'asc' }, select: { id: true, email: true, username: true, displayName: true, status: true, mfaEnabled: true, lastLoginAt: true, lastLoginIp: true, role: { select: { id: true, name: true } } } }),
      this.prisma.role.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { users: true } } } }),
    ]);
    return { staff, roles, permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })) };
  }

  @Perm('staff.manage')
  @Post()
  async create(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ email: z.string().email(), username: z.string().regex(/^[a-z0-9_.]{3,24}$/), displayName: z.string().trim().min(2).max(40), roleId: z.string().uuid(), password: z.string().min(10).max(128) })))
    body: { email: string; username: string; displayName: string; roleId: string; password: string },
  ) {
    const problem = passwordProblems(body.password, body.email, body.username);
    if (problem) throw Errors.business('WEAK_PASSWORD', problem);
    const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw Errors.notFound('Vai trò');
    if (role.permissions.includes('*') && !a.user.role?.permissions.includes('*')) throw Errors.forbidden();
    const user = await this.prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        username: body.username,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        isStaff: true,
        roleId: role.id,
      },
    });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'staff.create', targetType: 'user', targetId: user.id, data: { role: role.name } });
    return { id: user.id };
  }

  @Perm('staff.manage')
  @Patch(':id')
  async update(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ roleId: z.string().uuid().nullable() }))) body: { roleId: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { id: uuid(id) }, include: { role: true } });
    if (!user || !user.isStaff) throw Errors.notFound('Nhân sự');
    if (user.id === a.user.id) throw Errors.bad('Không thể tự đổi quyền của mình');
    if (user.role?.permissions.includes('*') && !a.user.role?.permissions.includes('*')) throw Errors.forbidden();
    if (body.roleId === null) {
      await this.prisma.user.update({ where: { id: user.id }, data: { isStaff: false, roleId: null } });
      await this.prisma.session.updateMany({ where: { userId: user.id, kind: 'ADMIN', revokedAt: null }, data: { revokedAt: new Date() } });
    } else {
      const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
      if (!role) throw Errors.notFound('Vai trò');
      if (role.permissions.includes('*') && !a.user.role?.permissions.includes('*')) throw Errors.forbidden();
      await this.prisma.user.update({ where: { id: user.id }, data: { roleId: role.id } });
    }
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: body.roleId ? 'staff.role_change' : 'staff.remove', targetType: 'user', targetId: user.id, data: { from: user.role?.name, to: body.roleId } });
    return { ok: true };
  }

  @Perm('staff.manage')
  @Post('roles')
  async createRole(@Auth() a: AuthContext, @Body(Z(z.object({ name: z.string().regex(/^[A-Z_]{3,30}$/), description: z.string().max(200).optional(), permissions: z.array(z.string()).max(50) }))) body: { name: string; description?: string; permissions: string[] }) {
    const invalid = body.permissions.filter((p) => !(p in PERMISSIONS));
    if (invalid.length) throw Errors.bad(`Quyền không hợp lệ: ${invalid.join(', ')}`);
    const role = await this.prisma.role.create({ data: body });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'role.create', targetType: 'role', targetId: role.id, data: body });
    return role;
  }

  @Perm('staff.manage')
  @Patch('roles/:id')
  async updateRole(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ description: z.string().max(200).optional(), permissions: z.array(z.string()).max(50) }))) body: { description?: string; permissions: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id: uuid(id) } });
    if (!role) throw Errors.notFound('Vai trò');
    if (role.isSystem && role.permissions.includes('*')) throw Errors.forbidden('Không sửa được vai trò Super Admin');
    const invalid = body.permissions.filter((p) => !(p in PERMISSIONS));
    if (invalid.length) throw Errors.bad(`Quyền không hợp lệ: ${invalid.join(', ')}`);
    const updated = await this.prisma.role.update({ where: { id: role.id }, data: body });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'role.update', targetType: 'role', targetId: role.id, data: { before: role.permissions, after: body.permissions } });
    return updated;
  }
}

@AdminArea()
@Controller('admin/system')
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  @Perm('audit.view')
  @Get('audit')
  async auditLogs(@Query() q: Record<string, string>) {
    const p = z.object({ action: z.string().max(60).optional(), actor: z.string().max(60).optional(), target: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(q);
    let actorId: string | undefined;
    if (p.actor) actorId = (await this.prisma.user.findFirst({ where: { OR: [{ username: p.actor.toLowerCase() }, ...(z.string().uuid().safeParse(p.actor).success ? [{ id: p.actor }] : [])] } }))?.id ?? '00000000-0000-0000-0000-000000000000';
    const where = { ...(p.action ? { action: { startsWith: p.action } } : {}), ...(actorId ? { actorId } : {}), ...(p.target ? { targetId: p.target } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (p.page - 1) * 50, take: 50 }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, username: true, displayName: true, isStaff: true } });
    return { items: rows.map((r) => ({ ...r, id: r.id.toString(), actor: actors.find((x) => x.id === r.actorId) ?? null })), total, page: p.page, pageSize: 50 };
  }

  @Perm('audit.view')
  @Get('audit/verify')
  verifyAudit() {
    return this.audit.verifyChain();
  }

  @Perm('settings.manage')
  @Get('settings')
  async getSettings() {
    return this.settings.all();
  }

  @Perm('settings.manage')
  @Put('settings/:key')
  async putSetting(@Auth() a: AuthContext, @Param('key') key: string, @Body(Z(z.object({ value: z.unknown(), reason: z.string().trim().min(5).max(500) }))) body: { value: unknown; reason: string }) {
    if (!(key in SETTING_DEFAULTS) || key === 'ledger.lastVerify') throw Errors.bad('Khoá cấu hình không hợp lệ');
    const def = SETTING_DEFAULTS[key as SettingKey];
    const ok = typeof def === typeof body.value && Array.isArray(def) === Array.isArray(body.value);
    if (!ok) throw Errors.bad('Kiểu giá trị không khớp');
    if (typeof def === 'number' && (!Number.isFinite(body.value as number) || (body.value as number) < 0)) throw Errors.bad('Giá trị không hợp lệ');
    const before = await this.settings.get(key as SettingKey);
    await this.settings.set(key as SettingKey, body.value as never, a.user.id);
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'settings.update', targetType: 'setting', targetId: key, reason: body.reason, data: { before, after: body.value } });
    return { ok: true };
  }

  @Perm('settings.manage')
  @Post('kill-switch')
  async killSwitch(@Auth() a: AuthContext, @Body(Z(z.object({ feature: z.enum(['orders', 'deposits', 'withdrawals', 'registration', 'chat']), enabled: z.boolean(), reason: z.string().trim().min(5).max(500) }))) body: { feature: string; enabled: boolean; reason: string }) {
    const ks = await this.settings.get('killSwitch');
    await this.settings.set('killSwitch', { ...ks, [body.feature]: body.enabled }, a.user.id);
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `killswitch.${body.feature}.${body.enabled ? 'on' : 'off'}`, targetType: 'setting', targetId: 'killSwitch', reason: body.reason });
    return { ok: true };
  }

  @Perm('settings.manage')
  @Post('logout-all')
  async logoutAll(@Auth() a: AuthContext, @Body(Z(z.object({ scope: z.enum(['users', 'staff']), reason: z.string().trim().min(5).max(500) }))) body: { scope: 'users' | 'staff'; reason: string }) {
    const r = await this.prisma.session.updateMany({
      where: { revokedAt: null, kind: body.scope === 'staff' ? 'ADMIN' : 'WEB', ...(body.scope === 'staff' ? { id: { not: a.session.id } } : {}) },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: `sessions.revoke_all_${body.scope}`, reason: body.reason, data: { count: r.count } });
    return { revoked: r.count };
  }
}
