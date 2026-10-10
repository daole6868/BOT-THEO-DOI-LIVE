import { Injectable } from '@nestjs/common';
import type { SessionKind, User } from '@prisma/client';
import type { Response } from 'express';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { randomCode, randomToken, sha256Hex } from '../../common/crypto/crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppError, Errors } from '../../common/errors';
import { MailService } from '../../common/mail.service';
import {
  burnTime,
  hashPassword,
  isBreachedPassword,
  passwordProblems,
  verifyPassword,
  verifyTurnstile,
} from '../../common/password';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { SessionService } from '../../common/session.service';
import { SettingsService } from '../../common/settings.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../../common/totp';
import type { AuthUser, RequestMeta } from '../../common/auth.types';

const RESERVED_USERNAMES = ['admin', 'administrator', 'support', 'hotro', 'ho_tro', 'mod', 'moderator', 'system', 'root', 'staff', 'mmomarket', 'cskh', 'nhanvien'];
const LOCK_STEPS_MIN = [1, 5, 15, 60];

interface Challenge {
  userId: string;
  kind: SessionKind;
  attempts: number;
  setup: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------- Đăng ký & xác minh ----------------

  async register(
    input: { email: string; username: string; displayName: string; password: string; turnstileToken?: string },
    meta: RequestMeta,
  ) {
    if (await this.settings.killSwitch('registration')) throw Errors.killSwitch('đăng ký');
    if (!(await verifyTurnstile(input.turnstileToken, meta.ip))) throw Errors.bad('Xác minh CAPTCHA thất bại');

    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    if (RESERVED_USERNAMES.some((r) => username.includes(r))) {
      throw Errors.business('USERNAME_RESERVED', 'Tên đăng nhập này không được phép sử dụng');
    }
    const problem = passwordProblems(input.password, email, username);
    if (problem) throw Errors.business('WEAK_PASSWORD', problem);
    if (await isBreachedPassword(input.password)) {
      throw Errors.business('BREACHED_PASSWORD', 'Mật khẩu này đã xuất hiện trong các vụ lộ dữ liệu. Hãy chọn mật khẩu khác.');
    }
    if (await this.prisma.user.findUnique({ where: { username } })) {
      throw Errors.conflict('USERNAME_TAKEN', 'Tên đăng nhập đã có người dùng');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Không tiết lộ email đã tồn tại: báo cho chủ email thay vì báo lỗi
      this.mail.send(email, 'Có người dùng email của bạn để đăng ký', [
        'Ai đó vừa thử đăng ký tài khoản mới bằng email này. Nếu là bạn, hãy dùng chức năng Quên mật khẩu.',
      ]);
      return { ok: true };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        displayName: input.displayName.trim(),
        passwordHash: await hashPassword(input.password),
      },
    });
    await this.sendVerifyEmail(user);
    return { ok: true };
  }

  private async createEmailToken(userId: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', ttlMin: number) {
    const token = randomToken(32);
    await this.prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.emailToken.create({
      data: { userId, purpose, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + ttlMin * 60_000) },
    });
    return token;
  }

  async sendVerifyEmail(user: User) {
    if (user.emailVerifiedAt) return { ok: true };
    const token = await this.createEmailToken(user.id, 'VERIFY_EMAIL', 30);
    this.mail.send(
      user.email,
      'Xác minh email',
      [`Chào ${user.displayName},`, 'Bấm nút bên dưới để xác minh email. Liên kết hết hạn sau 30 phút.'],
      { label: 'Xác minh email', url: `${env.WEB_ORIGIN}/xac-minh-email?token=${token}` },
    );
    return { ok: true };
  }

  private async consumeToken(token: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
      throw Errors.business('TOKEN_INVALID', 'Liên kết không hợp lệ hoặc đã hết hạn');
    }
    const updated = await this.prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (updated.count !== 1) throw Errors.business('TOKEN_INVALID', 'Liên kết đã được sử dụng');
    return row;
  }

  async verifyEmail(token: string) {
    const row = await this.consumeToken(token, 'VERIFY_EMAIL');
    await this.prisma.user.updateMany({
      where: { id: row.userId, status: 'UNVERIFIED' },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    return { ok: true };
  }

  // ---------------- Đăng nhập ----------------

  async login(
    res: Response,
    input: { login: string; password: string; turnstileToken?: string },
    kind: SessionKind,
    meta: RequestMeta,
  ) {
    const login = input.login.trim().toLowerCase();
    const failKey = `loginfail:${meta.ip}`;
    const ipFails = Number((await this.redis.client.get(failKey)) ?? 0);
    if (ipFails >= 3 && env.TURNSTILE_SECRET_KEY && !(await verifyTurnstile(input.turnstileToken, meta.ip))) {
      throw new AppError('CAPTCHA_REQUIRED', 'Vui lòng hoàn thành CAPTCHA', 400);
    }

    const user = await this.prisma.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
    const fail = async (result: string, userId?: string) => {
      await this.redis.client.multi().incr(failKey).expire(failKey, 900).exec();
      await this.prisma.loginEvent.create({ data: { userId, login: login.slice(0, 100), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), kind, result } });
    };
    const generic = () => new AppError('INVALID_CREDENTIALS', 'Sai thông tin đăng nhập', 401);

    if (!user) {
      await burnTime(input.password);
      await fail('no_user');
      throw generic();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await fail('locked', user.id);
      const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError('ACCOUNT_TEMP_LOCKED', `Đăng nhập sai nhiều lần. Thử lại sau ${min} phút.`, 429);
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      const fails = user.failedLoginCount + 1;
      const step = fails >= 5 ? LOCK_STEPS_MIN[Math.min(fails - 5, LOCK_STEPS_MIN.length - 1)] : 0;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: fails, lockedUntil: step ? new Date(Date.now() + step * 60_000) : null },
      });
      await fail('bad_password', user.id);
      throw generic();
    }
    if (user.status === 'BANNED') {
      await fail('banned', user.id);
      throw Errors.forbidden('Tài khoản đã bị khoá vĩnh viễn');
    }
    if (kind === 'ADMIN' && !user.isStaff) {
      await fail('not_staff', user.id);
      throw generic();
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

    if (user.mfaEnabled || kind === 'ADMIN') {
      const setup = !user.mfaEnabled;
      const challenge = await this.createChallenge({ userId: user.id, kind, attempts: 0, setup });
      if (!setup) return { mfaRequired: true, challenge };
      const secret = generateTotpSecret();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mfaPendingSecretEnc: this.crypto.encryptField(secret, `mfa:${user.id}`) },
      });
      const url = otpauthUrl(env.APP_NAME, user.email, secret);
      return { mfaSetupRequired: true, challenge, otpauthUrl: url, secret, qr: await QRCode.toDataURL(url) };
    }

    await this.finishLogin(res, user, kind, meta, false);
    return { ok: true };
  }

  private async createChallenge(c: Challenge) {
    const token = randomToken(24);
    await this.redis.client.set(`mfa-ch:${sha256Hex(token)}`, JSON.stringify(c), 'EX', 300);
    return token;
  }

  async completeMfaLogin(res: Response, input: { challenge: string; code?: string; recoveryCode?: string }, kind: SessionKind, meta: RequestMeta) {
    const key = `mfa-ch:${sha256Hex(input.challenge)}`;
    const raw = await this.redis.client.get(key);
    if (!raw) throw Errors.business('CHALLENGE_EXPIRED', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    const ch = JSON.parse(raw) as Challenge;
    if (ch.kind !== kind) throw Errors.business('CHALLENGE_EXPIRED', 'Phiên đăng nhập không hợp lệ');
    if (ch.attempts >= 5) {
      await this.redis.client.del(key);
      throw Errors.business('CHALLENGE_EXPIRED', 'Nhập sai quá nhiều lần, vui lòng đăng nhập lại');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ch.userId } });

    let recoveryCodes: string[] | undefined;
    let ok = false;
    if (ch.setup) {
      if (!user.mfaPendingSecretEnc || !input.code) throw Errors.bad('Thiếu mã xác thực');
      const secret = this.crypto.decryptField(user.mfaPendingSecretEnc, `mfa:${user.id}`);
      const step = verifyTotp(secret, input.code);
      if (step != null) {
        recoveryCodes = await this.enableMfa(user.id, secret, step);
        ok = true;
      }
    } else if (input.code) {
      ok = await this.checkTotp(user, input.code);
    } else if (input.recoveryCode) {
      ok = await this.useRecoveryCode(user, input.recoveryCode);
    }

    if (!ok) {
      ch.attempts += 1;
      await this.redis.client.set(key, JSON.stringify(ch), 'KEEPTTL');
      await this.prisma.loginEvent.create({ data: { userId: user.id, login: user.email, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), kind, result: 'mfa_failed' } });
      throw Errors.business('MFA_INVALID', 'Mã xác thực không đúng');
    }
    await this.redis.client.del(key);
    await this.finishLogin(res, user, kind, meta, true);
    return { ok: true, recoveryCodes };
  }

  private async finishLogin(res: Response, user: User, kind: SessionKind, meta: RequestMeta, mfaVerified: boolean) {
    const seenIp = await this.prisma.loginEvent.findFirst({ where: { userId: user.id, ip: meta.ip, result: 'success' } });
    const hadLogin = !!user.lastLoginAt;
    await this.sessions.create(res, user.id, kind, meta, mfaVerified);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: meta.ip } });
    await this.prisma.loginEvent.create({ data: { userId: user.id, login: user.email, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), kind, result: 'success' } });
    await this.redis.client.del(`loginfail:${meta.ip}`);
    if (hadLogin && !seenIp) {
      this.mail.send(user.email, 'Đăng nhập từ địa chỉ mới', [
        `Tài khoản của bạn vừa đăng nhập từ IP ${meta.ip} (${(meta.userAgent || '').slice(0, 120)}) lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
        'Nếu không phải bạn: đổi mật khẩu ngay và đăng xuất tất cả thiết bị trong mục Bảo mật.',
      ]);
    }
    if (kind === 'ADMIN') {
      await this.audit.log({ actorId: user.id, ip: meta.ip, userAgent: meta.userAgent, action: 'staff.login' });
    }
  }

  async logout(res: Response, sessionId: string | undefined, kind: SessionKind) {
    if (sessionId) await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res, kind);
    return { ok: true };
  }

  // ---------------- Mật khẩu ----------------

  async forgotPassword(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status !== 'BANNED') {
      const token = await this.createEmailToken(user.id, 'RESET_PASSWORD', 15);
      this.mail.send(
        user.email,
        'Đặt lại mật khẩu',
        ['Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Liên kết hết hạn sau 15 phút.', 'Nếu không phải bạn, hãy bỏ qua email này.'],
        { label: 'Đặt lại mật khẩu', url: `${env.WEB_ORIGIN}/dat-lai-mat-khau?token=${token}` },
      );
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const row = await this.consumeToken(token, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
    const problem = passwordProblems(password, user.email, user.username);
    if (problem) throw Errors.business('WEAK_PASSWORD', problem);
    if (await isBreachedPassword(password)) throw Errors.business('BREACHED_PASSWORD', 'Mật khẩu này đã bị lộ trên Internet, hãy chọn mật khẩu khác');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        failedLoginCount: 0,
        lockedUntil: null,
        withdrawLockedUntil: new Date(Date.now() + 24 * 3600_000),
        ...(user.status === 'UNVERIFIED' ? { status: 'ACTIVE', emailVerifiedAt: new Date() } : {}),
      },
    });
    await this.sessions.revokeAll(user.id);
    this.mail.send(user.email, 'Mật khẩu đã được thay đổi', [
      `Mật khẩu tài khoản vừa được đặt lại từ IP ${meta.ip}. Chức năng rút tiền tạm khoá 24 giờ để bảo vệ bạn.`,
      'Nếu không phải bạn, liên hệ hỗ trợ ngay.',
    ]);
    return { ok: true };
  }

  async changePassword(user: AuthUser, sessionId: string, current: string, next: string) {
    if (!(await verifyPassword(user.passwordHash, current))) throw Errors.business('WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng');
    const problem = passwordProblems(next, user.email, user.username);
    if (problem) throw Errors.business('WEAK_PASSWORD', problem);
    if (await isBreachedPassword(next)) throw Errors.business('BREACHED_PASSWORD', 'Mật khẩu này đã bị lộ trên Internet, hãy chọn mật khẩu khác');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next), withdrawLockedUntil: new Date(Date.now() + 24 * 3600_000) },
    });
    await this.sessions.revokeAll(user.id, sessionId);
    this.mail.send(user.email, 'Mật khẩu đã được thay đổi', ['Mật khẩu vừa được đổi. Các thiết bị khác đã bị đăng xuất, rút tiền tạm khoá 24 giờ.']);
    return { ok: true };
  }

  // ---------------- 2FA ----------------

  async checkTotp(user: User, code: string): Promise<boolean> {
    if (!user.mfaEnabled || !user.mfaSecretEnc) return false;
    const secret = this.crypto.decryptField(user.mfaSecretEnc, `mfa:${user.id}`);
    const step = verifyTotp(secret, code, user.mfaLastStep);
    if (step == null) return false;
    // Cập nhật có điều kiện để chống dùng lại mã khi gửi song song
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
      data: { mfaLastStep: step },
    });
    return updated.count === 1;
  }

  private async useRecoveryCode(user: User, code: string): Promise<boolean> {
    const h = sha256Hex(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (!user.mfaRecoveryHashes.includes(h)) return false;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) },
    });
    this.mail.send(user.email, 'Đã dùng mã khôi phục 2FA', ['Một mã khôi phục 2FA vừa được dùng để đăng nhập. Nếu không phải bạn, đổi mật khẩu ngay.']);
    return true;
  }

  private makeRecoveryCodes() {
    const codes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
    return { codes, hashes: codes.map((c) => sha256Hex(c.replace(/-/g, ''))) };
  }

  private async enableMfa(userId: string, secret: string, step: number) {
    const { codes, hashes } = this.makeRecoveryCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecretEnc: this.crypto.encryptField(secret, `mfa:${userId}`),
        mfaPendingSecretEnc: null,
        mfaLastStep: step,
        mfaRecoveryHashes: hashes,
      },
    });
    return codes;
  }

  async mfaSetup(user: AuthUser, password: string) {
    if (user.mfaEnabled) throw Errors.business('MFA_ALREADY_ENABLED', '2FA đã được bật');
    if (!(await verifyPassword(user.passwordHash, password))) throw Errors.business('WRONG_PASSWORD', 'Mật khẩu không đúng');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaPendingSecretEnc: this.crypto.encryptField(secret, `mfa:${user.id}`) },
    });
    const url = otpauthUrl(env.APP_NAME, user.email, secret);
    return { otpauthUrl: url, secret, qr: await QRCode.toDataURL(url) };
  }

  async mfaEnable(user: AuthUser, sessionId: string, code: string) {
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (fresh.mfaEnabled) throw Errors.business('MFA_ALREADY_ENABLED', '2FA đã được bật');
    if (!fresh.mfaPendingSecretEnc) throw Errors.business('MFA_NO_SETUP', 'Hãy bắt đầu cài đặt 2FA trước');
    const secret = this.crypto.decryptField(fresh.mfaPendingSecretEnc, `mfa:${user.id}`);
    const step = verifyTotp(secret, code);
    if (step == null) throw Errors.business('MFA_INVALID', 'Mã xác thực không đúng');
    const codes = await this.enableMfa(user.id, secret, step);
    await this.sessions.markMfaVerified(sessionId);
    await this.sessions.revokeAll(user.id, sessionId);
    this.mail.send(user.email, 'Đã bật xác thực 2 lớp', ['Xác thực 2 lớp (2FA) đã được bật cho tài khoản của bạn.']);
    return { recoveryCodes: codes };
  }

  async mfaDisable(user: AuthUser, code: string, password: string) {
    if (!user.mfaEnabled) throw Errors.business('MFA_NOT_ENABLED', '2FA chưa bật');
    if (user.isStaff) throw Errors.forbidden('Nhân sự không được tắt 2FA');
    const store = await this.prisma.store.findUnique({ where: { ownerId: user.id } });
    if (store) throw Errors.forbidden('Người bán bắt buộc phải bật 2FA');
    if (!(await verifyPassword(user.passwordHash, password))) throw Errors.business('WRONG_PASSWORD', 'Mật khẩu không đúng');
    if (!(await this.checkTotp(user, code))) throw Errors.business('MFA_INVALID', 'Mã xác thực không đúng');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: [], mfaLastStep: null, withdrawLockedUntil: new Date(Date.now() + 48 * 3600_000) },
    });
    this.mail.send(user.email, 'Đã tắt xác thực 2 lớp', ['2FA vừa bị tắt. Nếu không phải bạn, liên hệ hỗ trợ ngay.']);
    return { ok: true };
  }

  async regenerateRecovery(user: AuthUser, code: string) {
    if (!(await this.checkTotp(user, code))) throw Errors.business('MFA_INVALID', 'Mã xác thực không đúng');
    const { codes, hashes } = this.makeRecoveryCodes();
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryHashes: hashes } });
    return { recoveryCodes: codes };
  }

  async stepUp(user: AuthUser, sessionId: string, code: string) {
    if (!user.mfaEnabled) throw Errors.mfaSetupRequired();
    if (!(await this.checkTotp(user, code))) throw Errors.business('MFA_INVALID', 'Mã xác thực không đúng');
    await this.sessions.markMfaVerified(sessionId);
    return { ok: true, validForSeconds: 600 };
  }

  async setPin(user: AuthUser, pin: string, password: string) {
    if (!/^\d{6}$/.test(pin)) throw Errors.bad('PIN gồm đúng 6 chữ số');
    if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') throw Errors.business('WEAK_PIN', 'PIN quá dễ đoán');
    if (!(await verifyPassword(user.passwordHash, password))) throw Errors.business('WRONG_PASSWORD', 'Mật khẩu không đúng');
    await this.prisma.user.update({ where: { id: user.id }, data: { txnPinHash: await hashPassword(pin) } });
    this.mail.send(user.email, 'Đã đặt mã PIN giao dịch', ['Mã PIN giao dịch của bạn vừa được thiết lập/thay đổi.']);
    return { ok: true };
  }

  async verifyPin(user: User, pin: string | undefined) {
    if (!user.txnPinHash) throw Errors.business('PIN_NOT_SET', 'Bạn cần đặt mã PIN giao dịch trước (mục Bảo mật)');
    if (!pin) throw Errors.business('PIN_REQUIRED', 'Vui lòng nhập mã PIN giao dịch');
    const key = `pinfail:${user.id}`;
    const fails = Number((await this.redis.client.get(key)) ?? 0);
    if (fails >= 5) throw Errors.business('PIN_LOCKED', 'Nhập sai PIN quá nhiều lần, thử lại sau 30 phút');
    if (!(await verifyPassword(user.txnPinHash, pin))) {
      await this.redis.client.multi().incr(key).expire(key, 1800).exec();
      throw Errors.business('PIN_INVALID', 'Mã PIN không đúng');
    }
    await this.redis.client.del(key);
  }

  async listSessions(userId: string, currentId: string, kind: SessionKind = 'WEB') {
    const rows = await this.prisma.session.findMany({
      where: { userId, kind, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id.slice(0, 16),
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === currentId,
    }));
  }

  async revokeSessionByPrefix(userId: string, prefix: string) {
    if (!/^[a-f0-9]{16}$/.test(prefix)) throw Errors.bad('Mã phiên không hợp lệ');
    const s = await this.prisma.session.findFirst({ where: { userId, id: { startsWith: prefix }, revokedAt: null } });
    if (!s) throw Errors.notFound('Phiên');
    await this.sessions.revoke(s.id);
    return { ok: true };
  }
}
