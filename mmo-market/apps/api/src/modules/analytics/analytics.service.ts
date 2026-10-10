import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { LedgerService } from '../ledger/ledger.service';

const TZ = 'Asia/Ho_Chi_Minh';
const LEVELS = ['NEW', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];

type Series = { day: string; orders: number; gmv: number; prevOrders: number; prevGmv: number }[];

/** Số liệu cho dashboard. Tính trực tiếp bằng SQL tổng hợp có index (đủ nhanh cho quy mô vừa). */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
  ) {}

  private range(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 3600_000);
    const prevStart = new Date(start.getTime() - days * 24 * 3600_000);
    return { start, end, prevStart };
  }

  /** Đếm khoá bằng SCAN (không chặn Redis như KEYS). */
  private async countKeys(pattern: string) {
    let cursor = '0';
    let n = 0;
    do {
      const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = next;
      n += keys.length;
    } while (cursor !== '0' && n < 100_000);
    return n;
  }

  private pct(cur: number, prev: number) {
    if (!prev) return cur ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  }

  /** Chuỗi theo ngày (giờ VN) của số đơn & GMV, kèm kỳ trước để so sánh. */
  private async dailySeries(days: number, filter: Prisma.Sql): Promise<Series> {
    const { prevStart } = this.range(days);
    const rows = await this.prisma.$queryRaw<{ day: Date; orders: bigint; gmv: bigint | null }[]>`
      SELECT date_trunc('day', o."createdAt" AT TIME ZONE ${TZ}) AS day, count(*) AS orders, sum(o.total - o."refundedAmount") AS gmv
      FROM orders o
      WHERE o."createdAt" >= ${prevStart} AND o.status <> 'CANCELLED' AND ${filter}
      GROUP BY 1 ORDER BY 1`;
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const map = new Map(rows.map((r) => [key(r.day), r]));
    const localDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
    const out: Series = [];
    for (let i = days - 1; i >= 0; i--) {
      const t = Date.now() - i * 24 * 3600_000;
      const k = localDay(t);
      const pk = localDay(t - days * 24 * 3600_000);
      const cur = map.get(k);
      const prev = map.get(pk);
      out.push({ day: k, orders: Number(cur?.orders ?? 0), gmv: Number(cur?.gmv ?? 0), prevOrders: Number(prev?.orders ?? 0), prevGmv: Number(prev?.gmv ?? 0) });
    }
    return out;
  }

  // ---------------- Người bán ----------------

  async seller(storeId: string, sellerId: string, days: number) {
    const { start, prevStart } = this.range(days);
    const f = Prisma.sql`o."storeId" = ${storeId}::uuid`;
    const [series, byStatus, cur, prev, topProducts, balances, due24, releaseSchedule, todo, store, ratingRows, rules] = await Promise.all([
      this.dailySeries(days, f),
      this.prisma.order.groupBy({ by: ['status'], where: { storeId, createdAt: { gte: start } }, _count: true }),
      this.prisma.$queryRaw<{ orders: bigint; gmv: bigint | null; net: bigint | null; disputes: bigint }[]>`
        SELECT count(*) AS orders, sum(total - "refundedAmount") AS gmv,
               sum(CASE WHEN status = 'COMPLETED' THEN total - "refundedAmount" - "feeAmount" ELSE 0 END) AS net,
               (SELECT count(*) FROM disputes d JOIN orders o2 ON o2.id = d."orderId" WHERE o2."storeId" = ${storeId}::uuid AND d."createdAt" >= ${start}) AS disputes
        FROM orders WHERE "storeId" = ${storeId}::uuid AND "createdAt" >= ${start} AND status <> 'CANCELLED'`,
      this.prisma.$queryRaw<{ orders: bigint; gmv: bigint | null; net: bigint | null }[]>`
        SELECT count(*) AS orders, sum(total - "refundedAmount") AS gmv,
               sum(CASE WHEN status = 'COMPLETED' THEN total - "refundedAmount" - "feeAmount" ELSE 0 END) AS net
        FROM orders WHERE "storeId" = ${storeId}::uuid AND "createdAt" >= ${prevStart} AND "createdAt" < ${start} AND status <> 'CANCELLED'`,
      this.prisma.$queryRaw<{ id: string; title: string; orders: bigint; gmv: bigint; stock: number; views: number; delivery: string }[]>`
        SELECT p.id, p.title, count(o.id) AS orders, coalesce(sum(o.total - o."refundedAmount"), 0) AS gmv, p."stockTotal" AS stock, p."viewCount" AS views, p."deliveryType"::text AS delivery
        FROM products p LEFT JOIN orders o ON o."productId" = p.id AND o."createdAt" >= ${start} AND o.status <> 'CANCELLED'
        WHERE p."storeId" = ${storeId}::uuid AND p."deletedAt" IS NULL
        GROUP BY p.id ORDER BY gmv DESC, orders DESC LIMIT 8`,
      this.ledger.balances(sellerId),
      this.prisma.escrowHold.aggregate({ where: { sellerId, status: 'HOLDING', releaseAt: { lte: new Date(Date.now() + 24 * 3600_000) } }, _sum: { amount: true } }),
      this.prisma.$queryRaw<{ day: Date; amount: bigint }[]>`
        SELECT date_trunc('day', "releaseAt" AT TIME ZONE ${TZ}) AS day, sum(amount) AS amount FROM escrow_holds
        WHERE "sellerId" = ${sellerId}::uuid AND status = 'HOLDING' AND "releaseAt" < now() + interval '7 days'
        GROUP BY 1 ORDER BY 1`,
      Promise.all([
        this.prisma.dispute.findMany({ where: { order: { storeId }, status: 'OPEN' }, orderBy: { sellerDeadline: 'asc' }, take: 5, select: { id: true, sellerDeadline: true, order: { select: { code: true } } } }),
        this.prisma.order.count({ where: { storeId, status: 'PAID' } }),
        this.prisma.order.count({ where: { storeId, status: 'IN_PROGRESS' } }),
        this.prisma.product.findMany({ where: { storeId, deliveryType: 'AUTO', status: 'ACTIVE', deletedAt: null, stockTotal: { lt: 20 } }, select: { id: true, title: true, stockTotal: true }, take: 10 }),
        this.prisma.review.count({ where: { storeId, sellerReply: null } }),
        this.prisma.product.count({ where: { storeId, status: { in: ['PENDING_REVIEW', 'REJECTED'] } } }),
      ]),
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId } }),
      this.prisma.review.groupBy({ by: ['rating'], where: { storeId, status: 'VISIBLE' }, _count: true }),
      this.settings.get('levels.rules'),
    ]);
    const unreadMessages = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM messages m JOIN conversation_members cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${sellerId}::uuid
      WHERE m."senderId" <> ${sellerId}::uuid AND m."createdAt" > cm."lastReadAt"`;

    const c = cur[0];
    const p = prev[0];
    const curOrders = Number(c?.orders ?? 0);
    const levelIdx = LEVELS.indexOf(store.level);
    const nextLevel = LEVELS[levelIdx + 1];
    const nextRule = nextLevel ? rules[nextLevel] : null;
    return {
      range: days,
      kpis: {
        gmv: { value: Number(c?.gmv ?? 0), delta: this.pct(Number(c?.gmv ?? 0), Number(p?.gmv ?? 0)) },
        net: { value: Number(c?.net ?? 0), delta: this.pct(Number(c?.net ?? 0), Number(p?.net ?? 0)) },
        orders: { value: curOrders, delta: this.pct(curOrders, Number(p?.orders ?? 0)) },
        releasing24h: Number(due24._sum.amount ?? 0n),
        available: Number(balances.available),
        incomingEscrow: Number(balances.incomingEscrow),
        disputeRatePct: curOrders ? Math.round((Number(c?.disputes ?? 0) / curOrders) * 1000) / 10 : 0,
      },
      series,
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      topProducts: topProducts.map((t) => ({ ...t, orders: Number(t.orders), gmv: Number(t.gmv), conversionPct: t.views ? Math.round((Number(t.orders) / t.views) * 1000) / 10 : 0 })),
      releaseSchedule: releaseSchedule.map((r) => ({ day: r.day.toISOString().slice(0, 10), amount: Number(r.amount) })),
      todo: {
        disputes: todo[0].map((d) => ({ id: d.id, code: d.order.code, deadline: d.sellerDeadline })),
        toAccept: todo[1],
        inProgress: todo[2],
        lowStock: todo[3],
        unrepliedReviews: todo[4],
        productsNeedAttention: todo[5],
        unreadMessages: Number(unreadMessages[0]?.n ?? 0),
      },
      performance: {
        level: store.level,
        nextLevel: nextLevel ?? null,
        completedOrders: store.completedOrders,
        progressPct: nextRule ? Math.min(100, Math.round((store.completedOrders / nextRule.minOrders) * 100)) : 100,
        ordersToNext: nextRule ? Math.max(0, nextRule.minOrders - store.completedOrders) : 0,
        ratingAvg: store.ratingAvg,
        ratingCount: store.ratingCount,
        ratingDistribution: Object.fromEntries(ratingRows.map((r) => [r.rating, r._count])),
        lifetimeDisputeRatePct: store.completedOrders ? Math.round((store.disputeCount / store.completedOrders) * 1000) / 10 : 0,
      },
    };
  }

  // ---------------- Admin ----------------

  async admin(days: number) {
    const { start, prevStart } = this.range(days);
    const all = Prisma.sql`true`;
    const todayStart = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    todayStart.setHours(0, 0, 0, 0);
    const offsetMs = new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: TZ })).getTime();
    const today = new Date(todayStart.getTime() + offsetMs);

    const sumFee = async (from: Date, to?: Date) => {
      const r = await this.prisma.$queryRaw<{ v: bigint | null }[]>`
        SELECT sum(e.amount) AS v FROM ledger_entries e JOIN ledger_accounts a ON a.id = e."accountId"
        WHERE a.kind = 'PLATFORM_FEE_REVENUE' AND e.side = 'C' AND e."createdAt" >= ${from} ${to ? Prisma.sql`AND e."createdAt" < ${to}` : Prisma.empty}`;
      return Number(r[0]?.v ?? 0);
    };
    const orderAgg = async (from: Date, to?: Date) => {
      const r = await this.prisma.$queryRaw<{ n: bigint; gmv: bigint | null }[]>`
        SELECT count(*) AS n, sum(total - "refundedAmount") AS gmv FROM orders
        WHERE "createdAt" >= ${from} ${to ? Prisma.sql`AND "createdAt" < ${to}` : Prisma.empty} AND status <> 'CANCELLED'`;
      return { n: Number(r[0]?.n ?? 0), gmv: Number(r[0]?.gmv ?? 0) };
    };

    const [
      series, feeSeries, curOrders, prevOrders, curFee, prevFee, newUsers, prevUsers, depositsToday, withdrawalsToday,
      escrowTotal, queues, byCategory, heatmap, topStores, risk, lastVerify, online, jobs,
    ] = await Promise.all([
      this.dailySeries(days, all),
      this.prisma.$queryRaw<{ day: Date; fee: bigint }[]>`
        SELECT date_trunc('day', e."createdAt" AT TIME ZONE ${TZ}) AS day, sum(e.amount) AS fee
        FROM ledger_entries e JOIN ledger_accounts a ON a.id = e."accountId"
        WHERE a.kind = 'PLATFORM_FEE_REVENUE' AND e.side = 'C' AND e."createdAt" >= ${start} GROUP BY 1`,
      orderAgg(start),
      orderAgg(prevStart, start),
      sumFee(start),
      sumFee(prevStart, start),
      this.prisma.user.count({ where: { createdAt: { gte: start } } }),
      this.prisma.user.count({ where: { createdAt: { gte: prevStart, lt: start } } }),
      this.prisma.deposit.aggregate({ where: { status: 'COMPLETED', completedAt: { gte: today } }, _sum: { amountReceived: true }, _count: true }),
      this.prisma.withdrawal.aggregate({ where: { status: 'PAID', paidAt: { gte: today } }, _sum: { amount: true }, _count: true }),
      this.prisma.escrowHold.aggregate({ where: { status: { in: ['HOLDING', 'FROZEN'] } }, _sum: { amount: true } }),
      Promise.all([
        this.prisma.dispute.count({ where: { status: 'ESCALATED' } }),
        this.prisma.withdrawal.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
        this.prisma.withdrawal.count({ where: { status: 'ON_HOLD' } }),
        this.prisma.sellerApplication.count({ where: { status: 'PENDING' } }),
        this.prisma.product.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
        this.prisma.report.count({ where: { status: 'OPEN' } }),
        this.prisma.conversation.count({ where: { type: 'SUPPORT', supportStatus: 'QUEUED' } }),
        this.prisma.paymentWebhookEvent.count({ where: { status: 'UNMATCHED' } }),
        this.prisma.balanceAdjustment.count({ where: { status: 'PENDING' } }),
        this.prisma.requestPost.count({ where: { status: 'PENDING_REVIEW' } }),
        this.prisma.manualDepositClaim.count({ where: { status: 'PENDING' } }),
      ]),
      this.prisma.$queryRaw<{ name: string; gmv: bigint; orders: bigint }[]>`
        SELECT c.name, coalesce(sum(o.total - o."refundedAmount"), 0) AS gmv, count(o.id) AS orders
        FROM categories c
        LEFT JOIN orders o ON o."categoryId" IN (SELECT id FROM categories c2 WHERE c2.path = c.path OR c2.path LIKE c.path || '/%')
             AND o."createdAt" >= ${start} AND o.status <> 'CANCELLED'
        WHERE c."parentId" IS NULL GROUP BY c.id, c.name ORDER BY gmv DESC`,
      this.prisma.$queryRaw<{ dow: number; hour: number; n: bigint }[]>`
        SELECT extract(isodow FROM "createdAt" AT TIME ZONE ${TZ})::int AS dow, extract(hour FROM "createdAt" AT TIME ZONE ${TZ})::int AS hour, count(*) AS n
        FROM orders WHERE "createdAt" >= now() - interval '28 days' GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ slug: string; name: string; level: string; gmv: bigint; orders: bigint; disputes: number; completed: number }[]>`
        SELECT s.slug, s.name, s.level::text AS level, coalesce(sum(o.total - o."refundedAmount"), 0) AS gmv, count(o.id) AS orders,
               s."disputeCount" AS disputes, s."completedOrders" AS completed
        FROM stores s LEFT JOIN orders o ON o."storeId" = s.id AND o."createdAt" >= ${start} AND o.status <> 'CANCELLED'
        GROUP BY s.id ORDER BY gmv DESC LIMIT 8`,
      Promise.all([
        this.prisma.user.findMany({ where: { riskFlags: { isEmpty: false } }, take: 5, orderBy: { updatedAt: 'desc' }, select: { id: true, username: true, riskFlags: true } }),
        this.prisma.withdrawal.findMany({ where: { status: 'ON_HOLD' }, take: 5, orderBy: { createdAt: 'desc' }, select: { code: true, amount: true, flags: true, createdAt: true } }),
        this.prisma.$queryRaw<{ slug: string; name: string; rate: number }[]>`
          SELECT slug, name, round(("disputeCount"::numeric / greatest("completedOrders", 1)) * 100, 1)::float8 AS rate
          FROM stores WHERE "completedOrders" >= 10 AND "disputeCount"::numeric / greatest("completedOrders", 1) > 0.03 ORDER BY rate DESC LIMIT 5`,
        this.prisma.loginEvent.groupBy({ by: ['ip'], where: { result: { not: 'success' }, createdAt: { gte: new Date(Date.now() - 3600_000) } }, _count: true, having: { ip: { _count: { gt: 20 } } } }),
      ]),
      this.settings.get('ledger.lastVerify'),
      this.countKeys('presence:*'),
      this.redis.client.hgetall('jobs:lastRun'),
    ]);

    const feeMap = new Map(feeSeries.map((f) => [f.day.toISOString().slice(0, 10), Number(f.fee)]));
    const dbStart = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbMs = Date.now() - dbStart;
    const redisStart = Date.now();
    await this.redis.client.ping();
    const redisMs = Date.now() - redisStart;

    return {
      range: days,
      kpis: {
        gmv: { value: curOrders.gmv, delta: this.pct(curOrders.gmv, prevOrders.gmv) },
        feeRevenue: { value: curFee, delta: this.pct(curFee, prevFee) },
        orders: { value: curOrders.n, delta: this.pct(curOrders.n, prevOrders.n) },
        newUsers: { value: newUsers, delta: this.pct(newUsers, prevUsers) },
        onlineUsers: online,
        depositsToday: { amount: Number(depositsToday._sum.amountReceived ?? 0n), count: depositsToday._count },
        withdrawalsToday: { amount: Number(withdrawalsToday._sum.amount ?? 0n), count: withdrawalsToday._count },
        escrowHolding: Number(escrowTotal._sum.amount ?? 0n),
      },
      queues: {
        escalatedDisputes: queues[0],
        withdrawalsPending: queues[1],
        withdrawalsOnHold: queues[2],
        sellerApplications: queues[3],
        productsPending: queues[4],
        reportsOpen: queues[5],
        supportQueued: queues[6],
        unmatchedDeposits: queues[7],
        adjustmentsPending: queues[8],
        postsPending: queues[9],
        depositClaims: queues[10],
      },
      series: series.map((s) => ({ ...s, fee: feeMap.get(s.day) ?? 0 })),
      gmvByCategory: byCategory.map((c) => ({ name: c.name, gmv: Number(c.gmv), orders: Number(c.orders) })),
      heatmap: heatmap.map((h) => ({ dow: h.dow, hour: h.hour, n: Number(h.n) })),
      topStores: topStores.map((s) => ({ ...s, gmv: Number(s.gmv), orders: Number(s.orders), disputeRatePct: s.completed ? Math.round((s.disputes / s.completed) * 1000) / 10 : 0 })),
      risk: {
        flaggedUsers: risk[0],
        heldWithdrawals: risk[1],
        highDisputeStores: risk[2],
        bruteForceIps: risk[3].map((r) => ({ ip: r.ip, attempts: r._count })),
      },
      ledger: lastVerify,
      health: { dbMs, redisMs, jobs },
    };
  }
}
