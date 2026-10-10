import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { env } from '../../config/env';

/** Socket.IO dùng Redis pub/sub để nhiều instance API cùng phát sự kiện realtime. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis() {
    const pub = new Redis(env.REDIS_URL);
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN], credentials: true },
      maxHttpBufferSize: 64 * 1024,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
