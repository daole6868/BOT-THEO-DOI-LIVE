import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

/** Giá trị mặc định của cấu hình hệ thống. Admin có thể ghi đè trong bảng settings. */
export const SETTING_DEFAULTS = {
  'fees.defaultBps': 500,
  'hold.hoursByLevel': { NEW: 72, BRONZE: 48, SILVER: 24, GOLD: 12, DIAMOND: 6 } as Record<string, number>,
  'withdraw.minAmount': 50_000,
  'withdraw.dailyLimitByLevel': {
    NEW: 5_000_000,
    BRONZE: 20_000_000,
    SILVER: 50_000_000,
    GOLD: 200_000_000,
    DIAMOND: 1_000_000_000,
  } as Record<string, number>,
  'withdraw.fourEyesThreshold': 50_000_000,
  'deposit.minAmount': 10_000,
  'deposit.maxAmount': 100_000_000,
  'deposit.expireMinutes': 30,
  'order.stepUpThreshold': 5_000_000,
  'dispute.sellerResponseHours': 12,
  'dispute.buyerResponseHours': 24,
  'service.acceptHours': 24,
  'product.autoApproveLevels': ['SILVER', 'GOLD', 'DIAMOND'] as string[],
  'levels.rules': {
    BRONZE: { minOrders: 30, maxDisputeRatePct: 6 },
    SILVER: { minOrders: 200, maxDisputeRatePct: 4 },
    GOLD: { minOrders: 1000, maxDisputeRatePct: 3 },
    DIAMOND: { minOrders: 5000, maxDisputeRatePct: 2 },
  } as Record<string, { minOrders: number; maxDisputeRatePct: number }>,
  killSwitch: { orders: false, deposits: false, withdrawals: false, registration: false, chat: false } as Record<
    string,
    boolean
  >,
  'site.announcement': '',
  'ledger.lastVerify': null as null | { at: string; ok: boolean; problems: string[] },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; exp: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value as SettingValue<K>;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const def = SETTING_DEFAULTS[key];
    let value: unknown = row ? row.value : def;
    if (row && def && typeof def === 'object' && !Array.isArray(def) && typeof row.value === 'object') {
      value = { ...(def as object), ...(row.value as object) };
    }
    this.cache.set(key, { value, exp: Date.now() + 15_000 });
    return value as SettingValue<K>;
  }

  async set<K extends SettingKey>(key: K, value: SettingValue<K>, actorId?: string) {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
      update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
    });
    this.cache.delete(key);
  }

  async all() {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) out[key] = await this.get(key);
    return out;
  }

  async killSwitch(feature: 'orders' | 'deposits' | 'withdrawals' | 'registration' | 'chat'): Promise<boolean> {
    const ks = await this.get('killSwitch');
    return !!ks[feature];
  }

  invalidate() {
    this.cache.clear();
  }
}
