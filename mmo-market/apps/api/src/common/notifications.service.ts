import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from './prisma.service';
import { RealtimeService } from './realtime.service';

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async notify(userId: string, n: NotifyInput, tx?: Tx) {
    const db = tx ?? this.prisma;
    const row = await db.notification.create({
      data: { userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 500), link: n.link },
    });
    // Đẩy realtime sau khi ghi (nếu trong transaction thì có thể đẩy sớm hơn commit một chút - chấp nhận được với thông báo)
    setImmediate(() => this.realtime.toUser(userId, 'notification:new', row));
    return row;
  }

  async notifyMany(userIds: string[], n: NotifyInput) {
    for (const id of new Set(userIds)) await this.notify(id, n);
  }
}
