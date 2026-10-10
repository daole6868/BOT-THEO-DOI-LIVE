import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { env } from '../../config/env';
import { createRedis, isMemoryRedis } from '../../common/redis.service';

/** Socket.IO dùng Redis pub/sub để nhiều instance API cùng phát sự kiện realtime. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis() {
    // Chế độ Redis trong bộ nhớ chỉ có 1 tiến trình API -> không cần pub/sub giữa các instance
    if (isMemoryRedis()) return;
    const pub = createRedis();
    const sub = createRedis();
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
