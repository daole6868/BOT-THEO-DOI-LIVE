import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

/** REDIS_URL=memory:// -> dùng Redis giả lập trong bộ nhớ (chỉ để chạy thử 1 tiến trình, không cần cài Redis). */
export const isMemoryRedis = () => env.REDIS_URL.startsWith('memory');

const logger = new Logger('Redis');
let lastErrorLog = 0;

/** Tạo kết nối Redis (thật hoặc giả lập) và gắn bộ xử lý lỗi, ghi log tối đa 1 lần / 10 giây. */
export function createRedis(): Redis {
  if (isMemoryRedis()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisMock = require('ioredis-mock');
    return new RedisMock() as Redis;
  }
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  client.on('error', (e: Error & { code?: string }) => {
    if (Date.now() - lastErrorLog < 10_000) return;
    lastErrorLog = Date.now();
    const host = env.REDIS_URL.replace(/\/\/[^@]*@/, '//');
    logger.error(
      e.code === 'ECONNREFUSED'
        ? `Không kết nối được Redis (${host}). Hãy bật Redis, hoặc chạy "npm run quick" để dùng Redis trong bộ nhớ.`
        : e.message || String(e),
    );
  });
  return client;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = createRedis();
    if (isMemoryRedis()) logger.warn('Đang dùng Redis giả lập trong bộ nhớ (REDIS_URL=memory://) – chỉ dành cho chạy thử.');
  }

  duplicate(): Redis {
    return this.client.duplicate();
  }

  /** Khoá phân tán đơn giản (SET NX PX) để chỉ 1 tiến trình chạy job. */
  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
    const key = `lock:${name}`;
    const token = Math.random().toString(36).slice(2);
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (!ok) return undefined;
    try {
      return await fn();
    } finally {
      const cur = await this.client.get(key);
      if (cur === token) await this.client.del(key);
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
