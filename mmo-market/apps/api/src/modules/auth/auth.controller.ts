import { Body, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { cookieNames, env } from '../../config/env';
import type { AuthContext } from '../../common/auth.types';
import { randomToken } from '../../common/crypto/crypto';
import { AllowUnverified, Auth, Public, RateLimit, StepUp } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { Z } from '../../common/zod.pipe';
import { AuthService } from './auth.service';
import { serializeMe } from './serialize';

const meta = (req: Request) => ({ ip: req.ip ?? '', userAgent: String(req.headers['user-agent'] ?? '') });

export function issueCsrf(req: Request, res: Response, name: string) {
  let token = req.cookies?.[name];
  if (!token || typeof token !== 'string' || token.length < 20) {
    token = randomToken(24);
    res.cookie(name, token, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' });
  }
  return { token };
}

const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ').max(254),
  username: z.string().regex(/^[a-zA-Z0-9_.]{3,24}$/, 'Tên đăng nhập 3-24 ký tự: chữ, số, dấu _ hoặc .'),
  displayName: z.string().trim().min(2, 'Tên hiển thị tối thiểu 2 ký tự').max(40),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().max(2048).optional(),
});
const loginSchema = z.object({
  login: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().max(2048).optional(),
});
const mfaLoginSchema = z.object({
  challenge: z.string().min(10).max(100),
  code: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().max(20).optional(),
});
const code6 = z.object({ code: z.string().regex(/^\d{6}$/, 'Mã gồm 6 chữ số') });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return issueCsrf(req, res, cookieNames.csrfWeb);
  }

  @Public()
  @Get('me')
  async me(@Req() req: Request & { auth?: AuthContext }) {
    const a = req.auth;
    if (!a) return { user: null };
    const store = await this.prisma.store.findUnique({ where: { ownerId: a.user.id } });
    const unread = await this.prisma.notification.count({ where: { userId: a.user.id, readAt: null } });
    return { user: serializeMe(a.user, store), unreadNotifications: unread };
  }

  @Public()
  @RateLimit({ name: 'register', limit: 5, windowSec: 3600 })
  @Post('register')
  register(@Body(Z(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request) {
    return this.auth.register(body, meta(req));
  }

  @Public()
  @RateLimit({ name: 'verify', limit: 20, windowSec: 3600 })
  @Post('verify-email')
  verify(@Body(Z(z.object({ token: z.string().min(20).max(100) }))) body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }

  @AllowUnverified()
  @RateLimit({ name: 'resend', limit: 3, windowSec: 3600, by: 'user' })
  @Post('resend-verification')
  resend(@Auth() a: AuthContext) {
    return this.auth.sendVerifyEmail(a.user);
  }

  @Public()
  @RateLimit({ name: 'login', limit: 10, windowSec: 60 })
  @Post('login')
  login(@Body(Z(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(res, body, 'WEB', meta(req));
  }

  @Public()
  @RateLimit({ name: 'login-mfa', limit: 10, windowSec: 60 })
  @Post('login/mfa')
  loginMfa(@Body(Z(mfaLoginSchema)) body: z.infer<typeof mfaLoginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.completeMfaLogin(res, body, 'WEB', meta(req));
  }

  @AllowUnverified()
  @Post('logout')
  logout(@Auth() a: AuthContext, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(res, a.session.id, 'WEB');
  }

  @Public()
  @RateLimit({ name: 'forgot', limit: 5, windowSec: 3600 })
  @Post('password/forgot')
  forgot(@Body(Z(z.object({ email: z.string().email().max(254) }))) body: { email: string }) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @RateLimit({ name: 'reset', limit: 10, windowSec: 3600 })
  @Post('password/reset')
  reset(@Body(Z(z.object({ token: z.string().min(20).max(100), password: z.string().max(128) }))) body: { token: string; password: string }, @Req() req: Request) {
    return this.auth.resetPassword(body.token, body.password, meta(req));
  }

  @AllowUnverified()
  @RateLimit({ name: 'pwchange', limit: 5, windowSec: 3600, by: 'user' })
  @Post('password/change')
  change(@Auth() a: AuthContext, @Body(Z(z.object({ currentPassword: z.string().max(128), newPassword: z.string().max(128) }))) body: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(a.user, a.session.id, body.currentPassword, body.newPassword);
  }

  @AllowUnverified()
  @RateLimit({ name: 'stepup', limit: 10, windowSec: 300, by: 'user' })
  @Post('step-up')
  stepUp(@Auth() a: AuthContext, @Body(Z(code6)) body: { code: string }) {
    return this.auth.stepUp(a.user, a.session.id, body.code);
  }

  @AllowUnverified()
  @Get('sessions')
  sessions(@Auth() a: AuthContext) {
    return this.auth.listSessions(a.user.id, a.session.id);
  }

  @AllowUnverified()
  @Delete('sessions/:id')
  revokeSession(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.auth.revokeSessionByPrefix(a.user.id, id);
  }

  @AllowUnverified()
  @Post('sessions/revoke-others')
  async revokeOthers(@Auth() a: AuthContext) {
    await this.prisma.session.updateMany({
      where: { userId: a.user.id, revokedAt: null, id: { not: a.session.id } },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  @AllowUnverified()
  @Get('login-history')
  history(@Auth() a: AuthContext) {
    return this.prisma.loginEvent.findMany({
      where: { userId: a.user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { ip: true, userAgent: true, result: true, createdAt: true, kind: true },
    });
  }

  @RateLimit({ name: 'mfa-setup', limit: 10, windowSec: 3600, by: 'user' })
  @Post('mfa/setup')
  mfaSetup(@Auth() a: AuthContext, @Body(Z(z.object({ password: z.string().max(128) }))) body: { password: string }) {
    return this.auth.mfaSetup(a.user, body.password);
  }

  @RateLimit({ name: 'mfa-enable', limit: 10, windowSec: 300, by: 'user' })
  @Post('mfa/enable')
  mfaEnable(@Auth() a: AuthContext, @Body(Z(code6)) body: { code: string }) {
    return this.auth.mfaEnable(a.user, a.session.id, body.code);
  }

  @RateLimit({ name: 'mfa-disable', limit: 5, windowSec: 3600, by: 'user' })
  @Post('mfa/disable')
  mfaDisable(@Auth() a: AuthContext, @Body(Z(code6.extend({ password: z.string().max(128) }))) body: { code: string; password: string }) {
    return this.auth.mfaDisable(a.user, body.code, body.password);
  }

  @RateLimit({ name: 'mfa-recovery', limit: 5, windowSec: 3600, by: 'user' })
  @Post('mfa/recovery-codes')
  recovery(@Auth() a: AuthContext, @Body(Z(code6)) body: { code: string }) {
    return this.auth.regenerateRecovery(a.user, body.code);
  }

  @StepUp()
  @RateLimit({ name: 'pin', limit: 5, windowSec: 3600, by: 'user' })
  @Post('pin')
  setPin(@Auth() a: AuthContext, @Body(Z(z.object({ pin: z.string(), password: z.string().max(128) }))) body: { pin: string; password: string }) {
    return this.auth.setPin(a.user, body.pin, body.password);
  }
}
