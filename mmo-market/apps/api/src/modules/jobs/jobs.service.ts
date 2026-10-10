import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { BoardService } from '../board/board.service';
import { DisputesService } from '../disputes/disputes.service';
import { LedgerService } from '../ledger/ledger.service';
import { EscrowService } from '../orders/escrow.service';
import { OrdersService } from '../orders/orders.service';

const LEVELS = ['NEW', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND'] as const;

/** Tác vụ định kỳ. Dùng khoá Redis để khi chạy nhiều instance chỉ 1 nơi thực thi. */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  readonly lastRun: Record<string, string> = {};

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly orders: OrdersService,
    private readonly disputes: DisputesService,
    private readonly board: BoardService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
  ) {}

  private async run(name: string, ttlMs: number, fn: () => Promise<unknown>) {
    try {
      const r = await this.redis.withLock(`job:${name}`, ttlMs, fn);
      this.lastRun[name] = new Date().toISOString();
      await this.redis.client.hset('jobs:lastRun', name, this.lastRun[name]);
      if (typeof r === 'number' && r > 0) this.logger.log(`${name}: ${r}`);
    } catch (e: any) {
      this.logger.error(`${name} lỗi: ${e.message}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  releaseEscrow() {
    return this.run('escrow.release', 55_000, () => this.escrow.releaseDue());
  }

  @Cron('*/2 * * * *')
  disputesAuto() {
    return this.run('dispute.auto', 110_000, () => this.disputes.autoResolve());
  }

  @Cron('*/5 * * * *')
  serviceTimeouts() {
    return this.run('order.service_timeout', 280_000, () => this.orders.processServiceTimeouts());
  }

  @Cron('*/5 * * * *')
  expireDeposits() {
    return this.run('deposit.expire', 280_000, async () => {
      const r = await this.prisma.deposit.updateMany({ where: { status: 'PENDING', expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } }, data: { status: 'EXPIRED' } });
      return r.count;
    });
  }

  @Cron('*/10 * * * *')
  expirePosts() {
    return this.run('post.expire', 500_000, () => this.board.expirePosts());
  }

  /** Kiểm tra toàn vẹn sổ cái hằng đêm; lệch thì tự tắt rút tiền. */
  @Cron('10 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  verifyLedger() {
    return this.run('ledger.verify', 30 * 60_000, async () => {
      const r = await this.ledger.verify();
      await this.settings.set('ledger.lastVerify', { at: r.checkedAt, ok: r.ok, problems: r.problems });
      if (!r.ok) {
        const ks = await this.settings.get('killSwitch');
        await this.settings.set('killSwitch', { ...ks, withdrawals: true });
        this.logger.error(`SỔ CÁI LỆCH - đã tự động tạm dừng rút tiền: ${r.problems.join('; ')}`);
      }
    });
  }

  /** Tính lại cấp gian hàng theo số đơn hoàn tất & tỷ lệ khiếu nại. */
  @Cron('30 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  recalcLevels() {
    return this.run('seller.levels', 30 * 60_000, async () => {
      const rules = await this.settings.get('levels.rules');
      const stores = await this.prisma.store.findMany({ select: { id: true, level: true, completedOrders: true, disputeCount: true } });
      let changed = 0;
      for (const s of stores) {
        const rate = s.completedOrders ? (s.disputeCount / s.completedOrders) * 100 : 0;
        let level: (typeof LEVELS)[number] = 'NEW';
        for (const l of LEVELS.slice(1)) {
          const r = rules[l];
          if (r && s.completedOrders >= r.minOrders && rate <= r.maxDisputeRatePct) level = l;
        }
        if (level !== s.level) {
          await this.prisma.store.update({ where: { id: s.id }, data: { level } });
          changed++;
        }
      }
      return changed;
    });
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  cleanup() {
    return this.run('cleanup', 30 * 60_000, async () => {
      const old = new Date(Date.now() - 90 * 24 * 3600_000);
      const [s, t] = await Promise.all([
        this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: old } }] } }),
        this.prisma.emailToken.deleteMany({ where: { expiresAt: { lt: old } } }),
      ]);
      return s.count + t.count;
    });
  }
}
