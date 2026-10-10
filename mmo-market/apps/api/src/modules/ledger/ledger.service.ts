import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../../common/prisma.service';
import { Acct, LedgerPostInput, postLedger } from './ledger.core';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  post(tx: Tx, input: LedgerPostInput) {
    return postLedger(tx, input);
  }

  async balances(userId: string) {
    const [accts, held] = await Promise.all([
      this.prisma.ledgerAccount.findMany({ where: { key: { in: [Acct.available(userId).key, Acct.pendingWithdrawal(userId).key] } } }),
      this.prisma.escrowHold.aggregate({ where: { sellerId: userId, status: { in: ['HOLDING', 'FROZEN'] } }, _sum: { amount: true } }),
    ]);
    const get = (k: string) => accts.find((a) => a.key === k)?.balance ?? 0n;
    return {
      available: get(Acct.available(userId).key),
      pendingWithdrawal: get(Acct.pendingWithdrawal(userId).key),
      incomingEscrow: held._sum.amount ?? 0n,
    };
  }

  /** Lịch sử biến động ví khả dụng của người dùng (dương = tiền vào). */
  async history(userId: string, page: number, pageSize: number, type?: string) {
    const acct = await this.prisma.ledgerAccount.findUnique({ where: { key: Acct.available(userId).key } });
    if (!acct) return { items: [], total: 0, page, pageSize };
    const where = { accountId: acct.id, ...(type ? { transaction: { type } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { transaction: true },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id.toString(),
        type: r.transaction.type,
        refType: r.transaction.refType,
        refId: r.transaction.refId,
        description: r.transaction.description,
        amount: r.side === 'C' ? r.amount : -r.amount,
        balanceAfter: r.balanceAfter,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Kiểm tra toàn vẹn sổ cái (chạy hằng đêm và theo yêu cầu admin). */
  async verify() {
    const problems: string[] = [];
    const unbalanced = await this.prisma.$queryRaw<{ id: string; diff: bigint }[]>`
      SELECT "transactionId" AS id, SUM(CASE WHEN side = 'D' THEN amount ELSE -amount END) AS diff
      FROM ledger_entries GROUP BY "transactionId" HAVING SUM(CASE WHEN side = 'D' THEN amount ELSE -amount END) <> 0 LIMIT 20`;
    for (const u of unbalanced) problems.push(`Giao dịch ${u.id} lệch ${u.diff}`);
    const mismatched = await this.prisma.$queryRaw<{ key: string; balance: bigint; computed: bigint }[]>`
      SELECT a.key, a.balance,
        COALESCE(SUM(CASE WHEN (a.kind IN ('PLATFORM_BANK','PLATFORM_ADJUSTMENT')) = (e.side = 'D') THEN e.amount ELSE -e.amount END), 0) AS computed
      FROM ledger_accounts a LEFT JOIN ledger_entries e ON e."accountId" = a.id
      GROUP BY a.id, a.key, a.balance
      HAVING a.balance <> COALESCE(SUM(CASE WHEN (a.kind IN ('PLATFORM_BANK','PLATFORM_ADJUSTMENT')) = (e.side = 'D') THEN e.amount ELSE -e.amount END), 0)
      LIMIT 20`;
    for (const m of mismatched) problems.push(`Tài khoản ${m.key}: số dư ${m.balance} ≠ tổng bút toán ${m.computed}`);
    const escrowAcct = await this.prisma.ledgerAccount.aggregate({ where: { kind: 'ESCROW' }, _sum: { balance: true } });
    const holds = await this.prisma.escrowHold.aggregate({ where: { status: { in: ['HOLDING', 'FROZEN'] } }, _sum: { amount: true } });
    const escrowBal = escrowAcct._sum.balance ?? 0n;
    const holdSum = holds._sum.amount ?? 0n;
    if (escrowBal !== holdSum) problems.push(`Escrow sổ cái ${escrowBal} ≠ tổng tiền đang giữ ${holdSum}`);
    const totals = await this.prisma.ledgerAccount.groupBy({ by: ['kind'], _sum: { balance: true } });
    return {
      ok: problems.length === 0,
      problems,
      checkedAt: new Date().toISOString(),
      totals: Object.fromEntries(totals.map((t) => [t.kind, t._sum.balance ?? 0n])),
    };
  }
}
