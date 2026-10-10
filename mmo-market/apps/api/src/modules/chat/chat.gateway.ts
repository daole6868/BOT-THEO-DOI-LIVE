import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { env } from '../../config/env';
import { RateLimitService } from '../../common/rate-limit.service';
import { RealtimeService } from '../../common/realtime.service';
import { RedisService } from '../../common/redis.service';
import { SessionService } from '../../common/session.service';
import { ChatService } from './chat.service';

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* bỏ qua cookie hỏng */
    }
  }
  return out;
}

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  clientMsgId: z.string().min(8).max(64),
  kind: z.enum(['TEXT', 'IMAGE', 'PRODUCT_CARD', 'ORDER_CARD']),
  body: z.string().max(4000).optional(),
  uploadId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  orderCode: z.string().max(20).optional(),
});

const ROOM_RE = /^(post|product):[0-9a-f-]{36}$/;

/**
 * Cổng realtime. Xác thực bằng cookie phiên lúc bắt tay, kiểm tra Origin.
 * Server tự đưa socket vào room `user:<id>`; client chỉ được vào room công khai (bài đăng/sản phẩm).
 */
@WebSocketGateway({ path: '/socket.io' })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');
  private readonly allowedOrigins = new Set([new URL(env.WEB_ORIGIN).origin, new URL(env.ADMIN_ORIGIN).origin]);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly sessions: SessionService,
    private readonly chat: ChatService,
    private readonly redis: RedisService,
    private readonly rateLimit: RateLimitService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    server.use(async (socket, next) => {
      try {
        const origin = socket.handshake.headers.origin;
        if (origin && !this.allowedOrigins.has(origin)) return next(new Error('ORIGIN_NOT_ALLOWED'));
        const cookies = parseCookies(socket.handshake.headers.cookie);
        const area = socket.handshake.auth?.area === 'admin' ? 'ADMIN' : 'WEB';
        const token = cookies[this.sessions.cookieName(area)];
        const session = await this.sessions.findValid(token, area);
        if (!session) {
          socket.data.anonymous = true;
          return next();
        }
        if (area === 'ADMIN' && (!session.user.isStaff || !session.mfaVerifiedAt)) return next(new Error('UNAUTHORIZED'));
        socket.data.user = session.user;
        socket.data.token = token;
        socket.data.area = area;
        socket.data.checkedAt = Date.now();
        next();
      } catch (e) {
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  async handleConnection(socket: Socket) {
    const user = socket.data.user;
    if (!user) return;
    const count = await this.redis.client.incr(`sockets:${user.id}`);
    await this.redis.client.expire(`sockets:${user.id}`, 3600);
    if (count > 10) {
      socket.emit('error', { code: 'TOO_MANY_CONNECTIONS' });
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${user.id}`);
    if (socket.data.area === 'ADMIN' && user.isStaff) {
      socket.join('staff');
      await this.redis.client.zadd('staff:online', Date.now(), user.id);
    }
    await this.redis.client.set(`presence:${user.id}`, '1', 'EX', 70);
  }

  async handleDisconnect(socket: Socket) {
    const user = socket.data.user;
    if (!user) return;
    const left = await this.redis.client.decr(`sockets:${user.id}`);
    if (left <= 0) {
      await this.redis.client.del(`presence:${user.id}`, `sockets:${user.id}`);
      if (socket.data.area === 'ADMIN') await this.redis.client.zrem('staff:online', user.id);
    }
  }

  /** Kiểm tra lại phiên mỗi phút (phiên bị thu hồi -> ngắt kết nối). */
  private async ensureSession(socket: Socket) {
    const user = socket.data.user;
    if (!user) throw new Error('UNAUTHORIZED');
    if (Date.now() - (socket.data.checkedAt ?? 0) > 60_000) {
      const s = await this.sessions.findValid(socket.data.token, socket.data.area);
      if (!s) {
        socket.disconnect(true);
        throw new Error('UNAUTHORIZED');
      }
      socket.data.user = s.user;
      socket.data.checkedAt = Date.now();
    }
    return socket.data.user;
  }

  private fail(e: any) {
    const r = e?.getResponse?.();
    return { error: { code: r?.code ?? e?.message ?? 'ERROR', message: r?.message ?? 'Không gửi được, vui lòng thử lại' } };
  }

  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown) {
    try {
      const user = await this.ensureSession(socket);
      const input = sendSchema.parse(body);
      const message = await this.chat.send(user, input);
      return { ok: true, message };
    } catch (e) {
      return this.fail(e);
    }
  }

  @SubscribeMessage('message:read')
  async onRead(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId?: string }) {
    try {
      const user = await this.ensureSession(socket);
      await this.chat.markRead(user.id, z.string().uuid().parse(body?.conversationId));
      return { ok: true };
    } catch (e) {
      return this.fail(e);
    }
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId?: string; isTyping?: boolean }) {
    try {
      const user = await this.ensureSession(socket);
      const r = await this.rateLimit.hit(`typing:${user.id}`, 30, 10);
      if (!r.allowed) return;
      await this.chat.typing(user.id, z.string().uuid().parse(body?.conversationId), !!body?.isTyping);
    } catch {
      /* bỏ qua */
    }
  }

  @SubscribeMessage('presence:ping')
  async onPing(@ConnectedSocket() socket: Socket) {
    const user = socket.data.user;
    if (!user) return;
    await this.redis.client.set(`presence:${user.id}`, '1', 'EX', 70);
    if (socket.data.area === 'ADMIN') await this.redis.client.zadd('staff:online', Date.now(), user.id);
  }

  @SubscribeMessage('room:join')
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { room?: string }) {
    if (typeof body?.room === 'string' && ROOM_RE.test(body.room) && socket.rooms.size < 20) socket.join(body.room);
  }

  @SubscribeMessage('room:leave')
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { room?: string }) {
    if (typeof body?.room === 'string' && ROOM_RE.test(body.room)) socket.leave(body.room);
  }
}
