import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Cầu nối để mọi service có thể đẩy sự kiện realtime tới người dùng. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server || userIds.length === 0) return;
    this.server.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
  }

  toStaff(event: string, payload: unknown) {
    this.server?.to('staff').emit(event, payload);
  }

  toRoom(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }
}
