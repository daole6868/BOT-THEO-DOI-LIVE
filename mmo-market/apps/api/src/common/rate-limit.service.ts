import { Injectable } from '@nestjs/common';
import { Errors } from './errors';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Cửa sổ cố định bằng INCR + EXPIRE NX. */
  async hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
    const k = `rl:${key}`;
    const res = await this.redis.client.multi().incr(k).expire(k, windowSec, 'NX').ttl(k).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowSec);
    return { allowed: count <= limit, retryAfter: ttl > 0 ? ttl : windowSec };
  }

  async enforce(key: string, limit: number, windowSec: number) {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) throw Errors.rateLimited(r.retryAfter);
  }

  async reset(key: string) {
    await this.redis.client.del(`rl:${key}`);
  }
}
