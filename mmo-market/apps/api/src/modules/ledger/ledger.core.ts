import type { AccountKind, Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';

type Tx = Prisma.TransactionClient;

export interface AccountRef {
  key: string;
  kind: AccountKind;
  ownerId?: string | null;
}

export const Acct = {
  available: (userId: string): AccountRef => ({ key: `user:${userId}:available`, kind: 'USER_AVAILABLE', ownerId: userId }),
  pendingWithdrawal: (userId: string): AccountRef => ({ key: `user:${userId}:pending_withdrawal`, kind: 'USER_PENDING_WITHDRAWAL', ownerId: userId }),
  /** Escrow tách theo người bán để giảm tranh chấp khoá khi nhiều đơn diễn ra song song. */
  escrow: (sellerId: string): AccountRef => ({ key: `escrow:${sellerId}`, kind: 'ESCROW', ownerId: sellerId }),
  bank: { key: 'platform:bank', kind: 'PLATFORM_BANK' } as AccountRef,
  fee: { key: 'platform:fee_revenue', kind: 'PLATFORM_FEE_REVENUE' } as AccountRef,
  adjustment: { key: 'platform:adjustment', kind: 'PLATFORM_ADJUSTMENT' } as AccountRef,
};

/** Tài sản/chi phí tăng bên Nợ; nợ phải trả (ví người dùng, escrow) và doanh thu tăng bên Có. */
const DEBIT_NORMAL: AccountKind[] = ['PLATFORM_BANK', 'PLATFORM_ADJUSTMENT'];
const NON_NEGATIVE: AccountKind[] = ['USER_AVAILABLE', 'USER_PENDING_WITHDRAWAL', 'ESCROW'];

export interface LedgerEntryInput {
  account: AccountRef;
  side: 'D' | 'C';
  amount: bigint;
}

export interface LedgerPostInput {
  type: string;
  refType: string;
  refId: string;
  idempotencyKey: string;
  description?: string;
  createdById?: string | null;
  approvedById?: string | null;
  entries: LedgerEntryInput[];
  /** Chỉ dùng khi nhập dữ liệu lịch sử (seed). Mặc định là thời điểm hiện tại. */
  createdAt?: Date;
}

/**
 * Ghi một giao dịch sổ cái kép trong transaction hiện tại.
 * - Kiểm tra tổng Nợ = tổng Có, số tiền > 0
 * - Khoá các tài khoản liên quan theo thứ tự khoá cố định (tránh deadlock)
 * - Không cho số dư ví người dùng/escrow âm
 * - Idempotent theo idempotencyKey
 */
export async function postLedger(tx: Tx, input: LedgerPostInput): Promise<{ id: string; duplicate: boolean; balances: Record<string, bigint> }> {
  if (!input.entries.length) throw new Error('Giao dịch sổ cái rỗng');
  let debit = 0n;
  let credit = 0n;
  for (const e of input.entries) {
    if (e.amount <= 0n) throw new Error('Bút toán phải có số tiền dương');
    if (e.side === 'D') debit += e.amount;
    else credit += e.amount;
  }
  if (debit !== credit) throw new Error(`Giao dịch không cân: Nợ ${debit} ≠ Có ${credit}`);

  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { id: existing.id, duplicate: true, balances: {} };

  const refs = new Map<string, AccountRef>();
  for (const e of input.entries) refs.set(e.account.key, e.account);
  const keys = [...refs.keys()].sort();

  for (const k of keys) {
    const r = refs.get(k)!;
    await tx.$executeRaw`
      INSERT INTO ledger_accounts (id, key, kind, "ownerId", balance, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${r.key}, ${r.kind}::"AccountKind", ${r.ownerId ?? null}::uuid, 0, now(), now())
      ON CONFLICT (key) DO NOTHING`;
  }
  const rows = await tx.$queryRaw<{ id: string; key: string; kind: AccountKind; balance: bigint }[]>`
    SELECT id, key, kind, balance FROM ledger_accounts WHERE key = ANY(${keys}) ORDER BY key FOR UPDATE`;
  const accounts = new Map(rows.map((r) => [r.key, { ...r }]));

  const txn = await tx.ledgerTransaction.create({
    data: {
      type: input.type,
      refType: input.refType,
      refId: input.refId,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      createdById: input.createdById ?? null,
      approvedById: input.approvedById ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });

  const entryRows: Prisma.LedgerEntryCreateManyInput[] = [];
  for (const e of input.entries) {
    const acc = accounts.get(e.account.key)!;
    const normal = DEBIT_NORMAL.includes(acc.kind) ? 'D' : 'C';
    acc.balance += e.side === normal ? e.amount : -e.amount;
    if (NON_NEGATIVE.includes(acc.kind) && acc.balance < 0n) {
      throw new AppError('INSUFFICIENT_BALANCE', 'Số dư không đủ', 422);
    }
    entryRows.push({ transactionId: txn.id, accountId: acc.id, side: e.side, amount: e.amount, balanceAfter: acc.balance, ...(input.createdAt ? { createdAt: input.createdAt } : {}) });
  }
  await tx.ledgerEntry.createMany({ data: entryRows });
  for (const acc of accounts.values()) {
    await tx.ledgerAccount.update({ where: { id: acc.id }, data: { balance: acc.balance } });
  }
  return { id: txn.id, duplicate: false, balances: Object.fromEntries([...accounts.values()].map((a) => [a.key, a.balance])) };
}

/** Khoá tài khoản ví để đọc số dư chính xác trong transaction. */
export async function lockedBalance(tx: Tx, ref: AccountRef): Promise<bigint> {
  const rows = await tx.$queryRaw<{ balance: bigint }[]>`SELECT balance FROM ledger_accounts WHERE key = ${ref.key} FOR UPDATE`;
  return rows[0]?.balance ?? 0n;
}
