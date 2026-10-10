import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { cookieNames } from '../../config/env';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Public, RateLimit } from '../../common/decorators';
import { Z } from '../../common/zod.pipe';
import { AuthService } from './auth.service';
import { issueCsrf } from './auth.controller';
import { serializeMe } from './serialize';

const meta = (req: Request) => ({ ip: req.ip ?? '', userAgent: String(req.headers['user-agent'] ?? '') });

@AdminArea()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return issueCsrf(req, res, cookieNames.csrfAdmin);
  }

  @Public()
  @Get('me')
  me(@Req() req: Request & { auth?: AuthContext }) {
    const a = req.auth;
    if (!a || !a.user.isStaff || !a.session.mfaVerifiedAt) return { user: null };
    return { user: serializeMe(a.user) };
  }

  @Public()
  @RateLimit({ name: 'admin-login', limit: 5, windowSec: 60 })
  @Post('login')
  login(
    @Body(Z(z.object({ login: z.string().min(3).max(254), password: z.string().max(128) }))) body: { login: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(res, body, 'ADMIN', meta(req));
  }

  @Public()
  @RateLimit({ name: 'admin-mfa', limit: 10, windowSec: 60 })
  @Post('mfa')
  mfa(
    @Body(Z(z.object({ challenge: z.string().min(10).max(100), code: z.string().regex(/^\d{6}$/).optional(), recoveryCode: z.string().max(20).optional() })))
    body: { challenge: string; code?: string; recoveryCode?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.completeMfaLogin(res, body, 'ADMIN', meta(req));
  }

  @Post('logout')
  logout(@Auth() a: AuthContext, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(res, a.session.id, 'ADMIN');
  }
}
