import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm, RateLimit } from '../../common/decorators';
import { Z } from '../../common/zod.pipe';
import { ChatService, SUPPORT_TOPICS } from './chat.service';

const uuid = (v: string) => z.string().uuid().parse(v);

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(@Auth() a: AuthContext, @Query('type') type?: string) {
    return this.chat.listConversations(a.user.id, type === 'SUPPORT' || type === 'DIRECT' ? type : undefined);
  }

  @Get('unread')
  async unread(@Auth() a: AuthContext) {
    return { count: await this.chat.unreadTotal(a.user.id) };
  }

  @RateLimit({ name: 'conv-open', limit: 60, windowSec: 3600, by: 'user' })
  @Post('conversations')
  open(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ peerUserId: z.string().uuid(), context: z.object({ type: z.enum(['product', 'order', 'post', 'store']), id: z.string().max(80) }).optional() })))
    body: { peerUserId: string; context?: { type: 'product' | 'order' | 'post' | 'store'; id: string } },
  ) {
    return this.chat.openDirect(a, body.peerUserId, body.context);
  }

  @Get('conversations/:id/messages')
  messages(@Auth() a: AuthContext, @Param('id') id: string, @Query('before') before?: string) {
    return this.chat.messages(a.user.id, uuid(id), before && !isNaN(Date.parse(before)) ? before : undefined);
  }

  /** Dự phòng khi WebSocket không khả dụng. */
  @Post('conversations/:id/messages')
  send(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ clientMsgId: z.string().min(8).max(64), kind: z.enum(['TEXT', 'IMAGE', 'PRODUCT_CARD', 'ORDER_CARD']), body: z.string().max(4000).optional(), uploadId: z.string().uuid().optional(), productId: z.string().uuid().optional(), orderCode: z.string().max(20).optional() })))
    body: any,
  ) {
    return this.chat.send(a.user, { ...body, conversationId: uuid(id) });
  }

  @Post('conversations/:id/read')
  read(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.chat.markRead(a.user.id, uuid(id));
  }

  @Get('support/topics')
  async topics() {
    return { topics: Object.entries(SUPPORT_TOPICS).map(([value, label]) => ({ value, label })), staffOnline: await this.chat.staffOnlineCount() };
  }

  @RateLimit({ name: 'support-open', limit: 10, windowSec: 3600, by: 'user' })
  @Post('support')
  support(@Auth() a: AuthContext, @Body(Z(z.object({ topic: z.string(), message: z.string().trim().min(5).max(2000) }))) body: { topic: string; message: string }) {
    return this.chat.openSupport(a, body.topic, body.message);
  }
}

@AdminArea()
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly chat: ChatService) {}

  @Perm('support.handle')
  @Get('queue')
  queue(@Query('status') status?: string) {
    return this.chat.staffQueue(['QUEUED', 'ASSIGNED', 'RESOLVED'].includes(status ?? '') ? status : undefined);
  }

  @Perm('support.handle')
  @Get('conversations/:id/messages')
  messages(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.chat.messages(a.user.id, uuid(id), undefined, 200, true);
  }

  @Perm('support.handle')
  @Post('conversations/:id/claim')
  claim(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.chat.staffClaim(a, uuid(id));
  }

  @Perm('support.handle')
  @Post('conversations/:id/messages')
  async send(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ clientMsgId: z.string().min(8).max(64), body: z.string().trim().min(1).max(4000) }))) body: { clientMsgId: string; body: string }) {
    await this.chat.assertMember(uuid(id), a.user.id).catch(async () => this.chat.staffClaim(a, uuid(id)));
    return this.chat.send(a.user, { conversationId: uuid(id), clientMsgId: body.clientMsgId, kind: 'TEXT', body: body.body });
  }

  @Perm('support.handle')
  @Post('conversations/:id/resolve')
  resolve(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.chat.staffResolve(a, uuid(id));
  }

  @Perm('community.moderate')
  @Post('conversations/:id/inspect')
  inspect(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ reason: z.string().trim().min(5).max(500) }))) body: { reason: string }) {
    return this.chat.staffViewDirect(a, uuid(id), body.reason);
  }
}
