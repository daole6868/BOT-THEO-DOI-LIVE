import { Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import type { AuthContext } from '../../common/auth.types';
import { Errors } from '../../common/errors';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeService } from '../../common/realtime.service';
import { Acct, postLedger } from '../ledger/ledger.core';
import { LedgerService } from '../ledger/ledger.service';

/**
 * Điều chỉnh số dư thủ công (nạp sai nội dung, bồi hoàn sự cố...) luôn theo nguyên tắc 4 mắt:
 * người tạo yêu cầu và người duyệt phải là 2 nhân sự khác nhau (ràng buộc cả ở DB).
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
  ) {}

  async request(staff: AuthContext, input: { userId: string; direction: 'CREDIT' | 'DEBIT'; amount: number; reason: string; type: 'MANUAL' | 'DEPOSIT_MATCH' | 'CLAIM'; refId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw Errors.notFound('Người dùng');
    if (input.type === 'DEPOSIT_MATCH') {
      const ev = await this.prisma.paymentWebhookEvent.findUnique({ where: { id: input.refId ?? '' } });
      if (!ev || ev.status !== 'UNMATCHED') throw Errors.bad('Giao dịch ngân hàng không ở trạng thái chưa khớp');
      if (input.direction !== 'CREDIT' || BigInt(input.amount) !== ev.amount) throw Errors.bad('Số tiền phải đúng bằng giao dịch ngân hàng');
      const dup = await this.prisma.balanceAdjustment.count({ where: { type: 'DEPOSIT_MATCH', refId: ev.id, status: { in: ['PENDING', 'APPROVED'] } } });
      if (dup) throw Errors.bad('Giao dịch này đã có yêu cầu khớp');
    }
    if (input.type === 'CLAIM') {
      const claim = await this.prisma.manualDepositClaim.findUnique({ where: { id: input.refId ?? '' } });
      if (!claim || claim.status !== 'PENDING' || claim.userId !== input.userId) throw Errors.bad('Yêu cầu nạp tay không hợp lệ');
    }
    const adj = await this.prisma.balanceAdjustment.create({
      data: { userId: input.userId, direction: input.direction, amount: BigInt(input.amount), reason: input.reason, type: input.type, refId: input.refId, requestedById: staff.user.id },
    });
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'adjustment.request', targetType: 'balance_adjustment', targetId: adj.id, reason: input.reason, data: { ...input } });
    this.realtime.toStaff('adjustment:new', { id: adj.id });
    return adj;
  }

  async decide(staff: AuthContext, id: string, approve: boolean, note?: string) {
    const adj = await this.prisma.balanceAdjustment.findUnique({ where: { id } });
    if (!adj) throw Errors.notFound('Yêu cầu điều chỉnh');
    if (adj.status !== 'PENDING') throw Errors.bad('Yêu cầu đã được xử lý');
    if (adj.requestedById === staff.user.id) throw Errors.forbidden('Không thể tự duyệt yêu cầu do chính mình tạo (nguyên tắc 4 mắt)');

    if (!approve) {
      await this.prisma.balanceAdjustment.update({ where: { id }, data: { status: 'REJECTED', decidedById: staff.user.id, decidedAt: new Date() } });
      await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'adjustment.reject', targetType: 'balance_adjustment', targetId: id, reason: note });
      return { ok: true };
    }

    await this.prisma.tx(async (tx) => {
      const r = await tx.balanceAdjustment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedById: staff.user.id, decidedAt: new Date() } });
      if (r.count !== 1) throw Errors.conflict('ADJUSTMENT_CHANGED', 'Yêu cầu đã được xử lý');
      const isDeposit = adj.type === 'DEPOSIT_MATCH' || adj.type === 'CLAIM';
      const counter = isDeposit ? Acct.bank : Acct.adjustment;
      await postLedger(tx, {
        type: isDeposit ? 'deposit_manual' : 'adjustment',
        refType: 'balance_adjustment',
        refId: adj.id,
        idempotencyKey: `adjustment:${adj.id}`,
        description: adj.reason,
        createdById: adj.requestedById,
        approvedById: staff.user.id,
        entries:
          adj.direction === 'CREDIT'
            ? [
                { account: counter, side: 'D', amount: adj.amount },
                { account: Acct.available(adj.userId), side: 'C', amount: adj.amount },
              ]
            : [
                { account: Acct.available(adj.userId), side: 'D', amount: adj.amount },
                { account: counter, side: 'C', amount: adj.amount },
              ],
      });
      if (adj.type === 'DEPOSIT_MATCH' && adj.refId) {
        await tx.paymentWebhookEvent.update({ where: { id: adj.refId }, data: { status: 'MATCHED_MANUAL', matchedUserId: adj.userId } });
      }
      if (adj.type === 'CLAIM' && adj.refId) {
        await tx.manualDepositClaim.update({ where: { id: adj.refId }, data: { status: 'APPROVED', handledById: staff.user.id, handleNote: note } });
      }
      await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'adjustment.approve', targetType: 'balance_adjustment', targetId: id, reason: note, data: { amount: adj.amount, direction: adj.direction, userId: adj.userId } }, tx);
    });
    await this.notify.notify(adj.userId, {
      type: 'wallet.adjusted',
      title: `${adj.direction === 'CREDIT' ? 'Cộng' : 'Trừ'} ${Number(adj.amount).toLocaleString('vi-VN')}đ vào ví`,
      body: adj.reason,
      link: '/tai-khoan/vi',
    });
    this.realtime.toUser(adj.userId, 'wallet:updated', await this.ledger.balances(adj.userId));
    return { ok: true };
  }

  async rejectClaim(staff: AuthContext, claimId: string, note: string) {
    const r = await this.prisma.manualDepositClaim.updateMany({ where: { id: claimId, status: 'PENDING' }, data: { status: 'REJECTED', handledById: staff.user.id, handleNote: note } });
    if (!r.count) throw Errors.bad('Yêu cầu không ở trạng thái chờ');
    const claim = await this.prisma.manualDepositClaim.findUniqueOrThrow({ where: { id: claimId } });
    await this.notify.notify(claim.userId, { type: 'claim.rejected', title: 'Yêu cầu xác nhận nạp tiền bị từ chối', body: note, link: '/tai-khoan/vi' });
    await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'claim.reject', targetType: 'manual_deposit_claim', targetId: claimId, reason: note });
    return { ok: true };
  }
}
