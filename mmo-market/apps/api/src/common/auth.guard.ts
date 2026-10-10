import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { env } from '../config/env';
import {
  ALLOW_UNVERIFIED,
  IS_ADMIN_AREA,
  IS_PUBLIC,
  PERMISSIONS,
  RATE_LIMITS,
  RateLimitRule,
  SELLER_ONLY,
  STEP_UP,
} from './decorators';
import { Errors } from './errors';
import { hasPermission } from './permissions';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';

const STEP_UP_WINDOW_MS = 10 * 60_000;

/**
 * Guard toàn cục:
 * 1. Giới hạn tần suất (theo IP / người dùng)
 * 2. Nhận diện phiên (cookie web hoặc admin tuỳ khu vực)
 * 3. Kiểm tra trạng thái tài khoản, quyền nhân sự, xác thực lại (step-up), quyền người bán
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request & { auth?: any }>();
    const ip = req.ip ?? '';
    const userAgent = String(req.headers['user-agent'] ?? '');

    const isPublic = !!this.meta<boolean>(IS_PUBLIC, ctx);
    const isAdmin = !!this.meta<boolean>(IS_ADMIN_AREA, ctx);
    const rules = this.meta<RateLimitRule[]>(RATE_LIMITS, ctx) ?? [];

    // Giới hạn chung theo IP
    await this.rateLimit.enforce(`ip:${ip}`, 600, 60);
    for (const r of rules.filter((r) => (r.by ?? 'ip') === 'ip')) {
      await this.rateLimit.enforce(`${r.name}:ip:${ip}`, r.limit, r.windowSec);
    }

    if (isAdmin && env.ADMIN_IP_ALLOWLIST.length && !env.ADMIN_IP_ALLOWLIST.includes(ip)) {
      throw Errors.notFound('Trang');
    }

    const kind = isAdmin ? 'ADMIN' : 'WEB';
    const token = req.cookies?.[this.sessions.cookieName(kind)];
    const session = await this.sessions.findValid(token, kind);

    if (session) {
      req.auth = { user: session.user, session, ip, userAgent };
    }

    if (isPublic) return true;
    if (!session) throw Errors.unauthorized();

    const user = session.user;
    if (user.status === 'BANNED') throw Errors.forbidden('Tài khoản đã bị khoá vĩnh viễn');
    if (user.status === 'LOCKED') throw Errors.forbidden('Tài khoản đang bị tạm khoá. Liên hệ hỗ trợ.');
    if (user.status === 'UNVERIFIED' && !this.meta<boolean>(ALLOW_UNVERIFIED, ctx)) {
      throw Errors.business('EMAIL_NOT_VERIFIED', 'Vui lòng xác minh email trước khi thực hiện thao tác này');
    }

    for (const r of rules.filter((r) => r.by === 'user')) {
      await this.rateLimit.enforce(`${r.name}:u:${user.id}`, r.limit, r.windowSec);
    }

    if (isAdmin) {
      if (!user.isStaff || !user.role) throw Errors.forbidden();
      if (!user.mfaEnabled || !session.mfaVerifiedAt) throw Errors.mfaSetupRequired();
      const perms = this.meta<string[]>(PERMISSIONS, ctx) ?? [];
      for (const p of perms) if (!hasPermission(user.role.permissions, p)) throw Errors.forbidden();
    }

    if (this.meta<boolean>(STEP_UP, ctx)) {
      if (!user.mfaEnabled) throw Errors.mfaSetupRequired();
      const at = session.mfaVerifiedAt?.getTime() ?? 0;
      if (Date.now() - at > STEP_UP_WINDOW_MS) throw Errors.mfaRequired();
    }

    if (this.meta<boolean>(SELLER_ONLY, ctx)) {
      const store = await this.prisma.store.findUnique({ where: { ownerId: user.id } });
      if (!store) throw Errors.forbidden('Bạn chưa có gian hàng. Hãy đăng ký bán hàng.');
      if (!user.mfaEnabled) throw Errors.mfaSetupRequired();
      if (store.status === 'SUSPENDED' && req.method !== 'GET') {
        throw Errors.forbidden('Gian hàng đang bị tạm khoá: ' + (store.suspendReason ?? ''));
      }
      req.auth.store = store;
    }

    return true;
  }
}
