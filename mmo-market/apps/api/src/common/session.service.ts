import { Injectable } from '@nestjs/common';
import type { SessionKind } from '@prisma/client';
import type { Response } from 'express';
import { cookieNames, env } from '../config/env';
import { randomToken, sha256Hex } from './crypto/crypto';
import { PrismaService } from './prisma.service';

const WEB_ABSOLUTE_MS = 30 * 24 * 3600_000;
const WEB_IDLE_MS = 7 * 24 * 3600_000;
const ADMIN_ABSOLUTE_MS = 8 * 3600_000;
const ADMIN_IDLE_MS = 30 * 60_000;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  cookieName(kind: SessionKind) {
    return kind === 'ADMIN' ? cookieNames.admin : cookieNames.web;
  }

  idleMs(kind: SessionKind) {
    return kind === 'ADMIN' ? ADMIN_IDLE_MS : WEB_IDLE_MS;
  }

  async create(
    res: Response,
    userId: string,
    kind: SessionKind,
    meta: { ip: string; userAgent: string },
    mfaVerified: boolean,
  ) {
    const token = randomToken(32);
    const now = Date.now();
    const session = await this.prisma.session.create({
      data: {
        id: sha256Hex(token),
        userId,
        kind,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
        mfaVerifiedAt: mfaVerified ? new Date() : null,
        expiresAt: new Date(now + (kind === 'ADMIN' ? ADMIN_ABSOLUTE_MS : WEB_ABSOLUTE_MS)),
      },
    });
    res.cookie(this.cookieName(kind), token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: kind === 'ADMIN' ? 'strict' : 'lax',
      path: '/',
      maxAge: kind === 'ADMIN' ? ADMIN_ABSOLUTE_MS : WEB_ABSOLUTE_MS,
    });
    return session;
  }

  clearCookie(res: Response, kind: SessionKind) {
    res.clearCookie(this.cookieName(kind), { path: '/', httpOnly: true, secure: env.COOKIE_SECURE });
  }

  async findValid(token: string | undefined, kind: SessionKind) {
    if (!token || token.length > 100) return null;
    const session = await this.prisma.session.findUnique({
      where: { id: sha256Hex(token) },
      include: { user: { include: { role: true } } },
    });
    if (!session || session.kind !== kind || session.revokedAt) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;
    if (now - session.lastSeenAt.getTime() > this.idleMs(kind)) return null;
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return session;
  }

  revoke(id: string) {
    return this.prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAll(userId: string, exceptId?: string) {
    return this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  markMfaVerified(id: string) {
    return this.prisma.session.update({ where: { id }, data: { mfaVerifiedAt: new Date() } });
  }
}
