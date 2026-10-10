import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis;

  constructor() {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: true });
    this.client.on('error', (e) => this.logger.error(e.message));
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
