import { Injectable } from '@nestjs/common';
import type { Withdrawal } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { randomCode } from '../../common/crypto/crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Errors } from '../../common/errors';
import { MailService } from '../../common/mail.service';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { SettingsService } from '../../common/settings.service';
import { Acct, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';
import { BANKS, normName } from '../stores/stores.service';

@Injectable()
export class WithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  // ---------------- Tài khoản ngân hàng ----------------

  async listBanks(userId: string) {
    const rows = await this.prisma.bankAccount.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((b) => ({ id: b.id, bankCode: b.bankCode, bankName: b.bankName, accountLast4: b.accountLast4, holderName: b.holderName, cooldownUntil: b.cooldownUntil, createdAt: b.createdAt }));
  }

  async addBank(a: AuthContext, input: { bankCode: string; accountNumber: string; holderName: string }) {
    const app = await this.prisma.sellerApplication.findUnique({ where: { userId: a.user.id } });
    if (!app || app.status !== 'APPROVED') throw Errors.forbidden('Chỉ người bán đã xác minh mới thêm được tài khoản rút tiền');
    if (!BANKS[input.bankCode]) throw Errors.bad('Ngân hàng không hợp lệ');
    if (normName(input.holderName) !== normName(app.fullName)) {
      throw Errors.business('BANK_NAME_MISMATCH', 'Tên chủ tài khoản phải trùng họ tên đã xác minh (KYC)');
    }
    const count = await this.prisma.bankAccount.count({ where: { userId: a.user.id, isActive: true } });
    if (count >= 3) throw Errors.business('BANK_LIMIT', 'Tối đa 3 tài khoản ngân hàng');
    const bank = await this.prisma.bankAccount.create({
      data: {
        userId: a.user.id,
        bankCode: input.bankCode,
        bankName: BANKS[input.bankCode],
        accountNumberEnc: this.crypto.encryptField(input.accountNumber, `bank:${a.user.id}`),
        accountLast4: input.accountNumber.slice(-4),
        holderName: normName(input.holderName),
        cooldownUntil: new Date(Date.now() + 48 * 3600_000),
      },
    });
    await this.audit.log({ actorId: a.user.id, ip: a.ip, userAgent: a.userAgent, action: 'bank.add', targetType: 'bank_account', targetId: bank.id });
    this.mail.send(a.user.email, 'Đã thêm tài khoản ngân hàng', [
      `Tài khoản ${BANKS[input.bankCode]} ****${bank.accountLast4} vừa được thêm từ IP ${a.ip}.`,
      'Để bảo vệ bạn, tài khoản mới chỉ dùng để rút tiền sau 48 giờ. Nếu không phải bạn, liên hệ hỗ trợ ngay.',
    ]);
    return { id: bank.id };
  }

  async removeBank(a: AuthContext, id: string) {
    const r = await this.prisma.bankAccount.updateMany({ where: { id, userId: a.user.id, isActive: true }, data: { isActive: false } });
    if (!r.count) throw Errors.notFound('Tài khoản ngân hàng');
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'bank.remove', targetType: 'bank_account', targetId: id });
    return { ok: true };
  }

  // ---------------- Lệnh rút ----------------

  async create(a: AuthContext, input: { bankAccountId: string; amount: number }, idemKey: string) {
    if (await this.settings.killSwitch('withdrawals')) throw Errors.killSwitch('rút tiền');
    const user = a.user;
    const store = a.store!;
    const existing = await this.prisma.withdrawal.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: idemKey } } });
    if (existing) return existing;
    if (user.withdrawLockedUntil && user.withdrawLockedUntil > new Date()) {
      throw Errors.business('WITHDRAW_LOCKED', `Rút tiền tạm khoá đến ${user.withdrawLockedUntil.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} do thay đổi bảo mật gần đây`);
    }
    const bank = await this.prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, userId: user.id, isActive: true } });
    if (!bank) throw Errors.notFound('Tài khoản ngân hàng');
    if (bank.cooldownUntil && bank.cooldownUntil > new Date()) throw Errors.business('BANK_COOLDOWN', 'Tài khoản ngân hàng mới thêm, chưa thể rút trong 48 giờ đầu');

    const [minAmount, limits, fourEyes] = await Promise.all([
      this.settings.get('withdraw.minAmount'),
      this.settings.get('withdraw.dailyLimitByLevel'),
      this.settings.get('withdraw.fourEyesThreshold'),
    ]);
    if (input.amount < minAmount) throw Errors.bad(`Số tiền rút tối thiểu ${minAmount.toLocaleString('vi-VN')}đ`);
    const since = new Date(Date.now() - 24 * 3600_000);
    const used = await this.prisma.withdrawal.aggregate({
      where: { userId: user.id, createdAt: { gte: since }, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      _sum: { amount: true },
    });
    const limit = limits[store.level] ?? limits.NEW;
    if (Number(used._sum.amount ?? 0n) + input.amount > limit) {
      throw Errors.business('DAILY_LIMIT', `Vượt hạn mức rút 24 giờ (${limit.toLocaleString('vi-VN')}đ) của cấp gian hàng`);
    }

    const flags: string[] = [];
    if (input.amount >= fourEyes) flags.push('large_amount');
    if (user.riskFlags.length) flags.push('risk_user');
    const recentSales = await this.prisma.order.count({ where: { storeId: store.id, status: 'COMPLETED', completedAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) } } });
    if (!recentSales) flags.push('no_recent_sales');
    const status = flags.some((f) => f === 'risk_user' || f === 'no_recent_sales') ? 'ON_HOLD' : 'REQUESTED';

    const w = await this.prisma.tx(async (tx) => {
      const w = await tx.withdrawal.create({
        data: { code: `RUT${randomCode(8)}`, userId: user.id, bankAccountId: bank.id, amount: BigInt(input.amount), status, flags, idempotencyKey: idemKey, holdReason: status === 'ON_HOLD' ? 'Tự động giữ lại để xác minh' : null },
      });
      await postLedger(tx, {
        type: 'withdraw_request',
        refType: 'withdrawal',
        refId: w.id,
        idempotencyKey: `withdraw:req:${w.id}`,
        description: `Tạo lệnh rút ${w.code}`,
        createdById: user.id,
        entries: [
          { account: Acct.available(user.id), side: 'D', amount: w.amount },
          { account: Acct.pendingWithdrawal(user.id), side: 'C', amount: w.amount },
        ],
      });
      return w;
    });
    await this.audit.log({ actorId: user.id, ip: a.ip, userAgent: a.userAgent, action: 'withdrawal.create', targetType: 'withdrawal', targetId: w.id, data: { amount: input.amount, flags } });
    this.mail.send(user.email, 'Đã tạo lệnh rút tiền', [
      `Lệnh rút ${w.code}: ${input.amount.toLocaleString('vi-VN')}đ về ${bank.bankName} ****${bank.accountLast4}.`,
      'Nếu không phải bạn, hãy huỷ lệnh và đổi mật khẩu ngay.',
    ]);
    this.realtime.toStaff('withdrawal:new', { code: w.code, amount: input.amount });
    this.realtime.toUser(user.id, 'wallet:updated', await this.ledger.balances(user.id));
    return w;
  }

  async listMine(userId: string, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.withdrawal.count({ where: { userId } }),
    ]);
    const banks = await this.prisma.bankAccount.findMany({ where: { id: { in: items.map((i) => i.bankAccountId) } } });
    return {
      items: items.map((w) => {
        const b = banks.find((x) => x.id === w.bankAccountId);
        return { code: w.code, amount: w.amount, status: w.status, bank: b ? `${b.bankName} ****${b.accountLast4}` : '', bankRef: w.bankRef, rejectReason: w.rejectReason, createdAt: w.createdAt, paidAt: w.paidAt };
      }),
      total,
      page,
      pageSize,
    };
  }

  private async reverse(w: Withdrawal, status: 'REJECTED' | 'CANCELLED', actorId: string, reason?: string) {
    await this.prisma.tx(async (tx) => {
      const r = await tx.withdrawal.updateMany({
        where: { id: w.id, status: { in: ['REQUESTED', 'ON_HOLD', 'APPROVED'] } },
        data: { status, rejectReason: reason },
      });
      if (r.count !== 1) throw Errors.conflict('WITHDRAWAL_CHANGED', 'Lệnh rút đã thay đổi trạng thái');
      await postLedger(tx, {
        type: 'withdraw_reverse',
        refType: 'withdrawal',
        refId: w.id,
        idempotencyKey: `withdraw:reverse:${w.id}`,
        description: status === 'CANCELLED' ? `Huỷ lệnh rút ${w.code}` : `Từ chối lệnh rút ${w.code}`,
        createdById: actorId,
        entries: [
          { account: Acct.pendingWithdrawal(w.userId), side: 'D', amount: w.amount },
          { account: Acct.available(w.userId), side: 'C', amount: w.amount },
        ],
      });
    });
    this.realtime.toUser(w.userId, 'wallet:updated', await this.ledger.balances(w.userId));
  }

  async cancel(a: AuthContext, code: string) {
    const w = await this.prisma.withdrawal.findFirst({ where: { code, userId: a.user.id } });
    if (!w) throw Errors.notFound('Lệnh rút');
    if (!['REQUESTED', 'ON_HOLD'].includes(w.status)) throw Errors.bad('Lệnh rút đã được duyệt, không thể huỷ');
    await this.reverse(w, 'CANCELLED', a.user.id);
    return { ok: true };
  }

  // ---------------- Admin ----------------

  async adminList(status: string | undefined, page: number, pageSize: number) {
    const where = status ? { status: status as any } : {};
    const [items, total] = await Promise.all([
      this.prisma.withdrawal.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.withdrawal.count({ where }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: items.map((i) => i.userId) } }, select: { id: true, username: true, displayName: true, store: { select: { name: true, level: true } } } });
    const banks = await this.prisma.bankAccount.findMany({ where: { id: { in: items.map((i) => i.bankAccountId) } } });
    return {
      items: items.map((w) => ({
        ...w,
        user: users.find((u) => u.id === w.userId),
        bank: (() => {
          const b = banks.find((x) => x.id === w.bankAccountId);
          return b ? { bankName: b.bankName, accountLast4: b.accountLast4, holderName: b.holderName } : null;
        })(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async revealAccount(staff: AuthContext, code: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { code } });
    if (!w) throw Errors.notFound('Lệnh rút');
    const bank = await this.prisma.bankAccount.findUniqueOrThrow({ where: { id: w.bankAccountId } });
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'withdrawal.reveal_account', targetType: 'withdrawal', targetId: w.id });
    return {
      bankCode: bank.bankCode,
      bankName: bank.bankName,
      accountNumber: this.crypto.decryptField(bank.accountNumberEnc, `bank:${bank.userId}`),
      holderName: bank.holderName,
      amount: w.amount,
      transferContent: `${w.code}`,
    };
  }

  async adminAction(staff: AuthContext, code: string, action: 'approve' | 'hold' | 'reject' | 'mark_paid', input: { reason?: string; bankRef?: string }) {
    const w = await this.prisma.withdrawal.findUnique({ where: { code } });
    if (!w) throw Errors.notFound('Lệnh rút');
    const fourEyes = await this.settings.get('withdraw.fourEyesThreshold');

    if (action === 'approve') {
      if (!['REQUESTED', 'ON_HOLD'].includes(w.status)) throw Errors.bad('Trạng thái không cho phép duyệt');
      await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'APPROVED', approvedById: staff.user.id, approvedAt: new Date() } });
    } else if (action === 'hold') {
      if (w.status !== 'REQUESTED') throw Errors.bad('Chỉ giữ lại được lệnh mới');
      if (!input.reason) throw Errors.bad('Nhập lý do giữ lại');
      await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'ON_HOLD', holdReason: input.reason } });
    } else if (action === 'reject') {
      if (!input.reason) throw Errors.bad('Nhập lý do từ chối');
      await this.reverse(w, 'REJECTED', staff.user.id, input.reason);
      await this.notify.notify(w.userId, { type: 'withdrawal.rejected', title: `Lệnh rút ${w.code} bị từ chối`, body: input.reason, link: '/seller/tai-chinh' });
    } else if (action === 'mark_paid') {
      if (w.status !== 'APPROVED') throw Errors.bad('Lệnh rút cần được duyệt trước');
      if (!input.bankRef) throw Errors.bad('Nhập mã giao dịch ngân hàng');
      if (Number(w.amount) >= fourEyes && w.approvedById === staff.user.id) {
        throw Errors.forbidden('Lệnh rút lớn: người xác nhận chuyển tiền phải khác người duyệt (nguyên tắc 4 mắt)');
      }
      await this.prisma.tx(async (tx) => {
        const r = await tx.withdrawal.updateMany({ where: { id: w.id, status: 'APPROVED' }, data: { status: 'PAID', paidById: staff.user.id, paidAt: new Date(), bankRef: input.bankRef } });
        if (r.count !== 1) throw Errors.conflict('WITHDRAWAL_CHANGED', 'Lệnh rút đã thay đổi trạng thái');
        await postLedger(tx, {
          type: 'withdraw_paid',
          refType: 'withdrawal',
          refId: w.id,
          idempotencyKey: `withdraw:paid:${w.id}`,
          description: `Đã chuyển tiền rút ${w.code} (${input.bankRef})`,
          createdById: staff.user.id,
          approvedById: w.approvedById,
          entries: [
            { account: Acct.pendingWithdrawal(w.userId), side: 'D', amount: w.amount },
            { account: Acct.bank, side: 'C', amount: w.amount },
          ],
        });
      });
      await this.notify.notify(w.userId, { type: 'withdrawal.paid', title: `Đã chuyển ${Number(w.amount).toLocaleString('vi-VN')}đ (lệnh ${w.code})`, link: '/seller/tai-chinh' });
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: w.userId } });
      this.mail.send(user.email, 'Đã chuyển tiền rút', [`Lệnh rút ${w.code} đã được chuyển khoản. Mã giao dịch ngân hàng: ${input.bankRef}.`]);
    }
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, userAgent: staff.userAgent, action: `withdrawal.${action}`, targetType: 'withdrawal', targetId: w.id, reason: input.reason, data: { bankRef: input.bankRef, amount: w.amount } });
    return { ok: true };
  }
}
