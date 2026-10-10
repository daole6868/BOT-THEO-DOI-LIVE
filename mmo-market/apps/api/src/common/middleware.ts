import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { cookieNames, env } from '../config/env';
import { safeEqual } from './crypto/crypto';

/** Gắn requestId cho mỗi request (trả về header X-Request-Id). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT = [/^\/api\/webhooks\//];

/**
 * Chống CSRF 2 lớp cho mọi request thay đổi dữ liệu:
 * - Origin/Referer phải thuộc web hoặc admin của sàn
 * - Header X-CSRF-Token phải khớp cookie csrf (double-submit, cookie HttpOnly)
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly allowed = new Set([new URL(env.WEB_ORIGIN).origin, new URL(env.ADMIN_ORIGIN).origin]);

  use(req: Request, res: Response, next: NextFunction) {
    // Dùng originalUrl: trong middleware của Nest, req.path có thể đã bị cắt tiền tố
    const fullPath = (req.originalUrl || req.url).split('?')[0];
    if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT.some((re) => re.test(fullPath))) return next();

    const origin = (req.headers.origin as string | undefined) ?? refererOrigin(req.headers.referer);
    if (origin && !this.allowed.has(origin)) return deny(res, 'Nguồn yêu cầu không hợp lệ');

    const isAdmin = fullPath.startsWith('/api/admin');
    const cookie = req.cookies?.[isAdmin ? cookieNames.csrfAdmin : cookieNames.csrfWeb];
    const header = req.headers['x-csrf-token'];
    if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
      return deny(res, 'Phiên làm việc hết hạn, vui lòng tải lại trang');
    }
    next();
  }
}

function refererOrigin(ref?: string): string | undefined {
  if (!ref) return undefined;
  try {
    return new URL(ref).origin;
  } catch {
    return 'invalid';
  }
}

function deny(res: Response, message: string) {
  res.status(403).json({ error: { code: 'CSRF_INVALID', message } });
}
