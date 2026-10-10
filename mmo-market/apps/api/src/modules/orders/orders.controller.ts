import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { Auth, RateLimit, SellerOnly } from '../../common/decorators';
import { requireIdemKey } from '../../common/util';
import { Z } from '../../common/zod.pipe';
import { DisputesService, DISPUTE_REASONS } from '../disputes/disputes.service';
import { ReviewsService } from '../reviews/reviews.service';
import { OrdersService } from './orders.service';

const STATUSES = ['PAID', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED', 'COMPLETED', 'REFUNDED', 'CANCELLED'] as const;
const listQ = z.object({
  status: z.enum(STATUSES).optional(),
  q: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const code = (c: string) => z.string().regex(/^DH[A-Z2-9]{8}$/, 'Mã đơn không hợp lệ').parse(c);

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly disputes: DisputesService,
    private readonly reviews: ReviewsService,
  ) {}

  @RateLimit({ name: 'order', limit: 30, windowSec: 60, by: 'user' })
  @Post()
  create(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10_000), buyerInput: z.string().max(2000).optional() })))
    body: { variantId: string; qty: number; buyerInput?: string },
    @Headers() h: Record<string, string>,
  ) {
    return this.orders.create(a, body, requireIdemKey(h));
  }

  @Get()
  list(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    return this.orders.listForBuyer(a.user.id, listQ.parse(q));
  }

  @Get('dispute-reasons')
  reasons() {
    return Object.entries(DISPUTE_REASONS).map(([value, label]) => ({ value, label }));
  }

  @Get(':code')
  detail(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.detailForBuyer(a.user.id, code(c));
  }

  @Get(':code/items')
  items(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.revealItems(a, code(c));
  }

  @Post(':code/confirm')
  confirm(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.confirm(a, code(c));
  }

  @Post(':code/cancel')
  cancel(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.buyerCancel(a, code(c));
  }

  @RateLimit({ name: 'dispute', limit: 10, windowSec: 3600, by: 'user' })
  @Post(':code/disputes')
  openDispute(
    @Auth() a: AuthContext,
    @Param('code') c: string,
    @Body(Z(z.object({ reason: z.string(), description: z.string().trim().min(10, 'Mô tả tối thiểu 10 ký tự').max(3000), stockItemIds: z.array(z.string().uuid()).max(10_000).default([]), attachmentIds: z.array(z.string().uuid()).max(10).default([]) })))
    body: { reason: string; description: string; stockItemIds: string[]; attachmentIds: string[] },
  ) {
    return this.disputes.open(a, code(c), body);
  }

  @Post(':code/review')
  review(@Auth() a: AuthContext, @Param('code') c: string, @Body(Z(z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().min(5).max(2000) }))) body: { rating: number; content: string }) {
    return this.reviews.create(a, code(c), body);
  }
}

@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @RateLimit({ name: 'dispute-msg', limit: 30, windowSec: 600, by: 'user' })
  @Post(':id/messages')
  message(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ message: z.string().trim().min(1).max(2000), attachmentIds: z.array(z.string().uuid()).max(10).default([]) }))) body: { message: string; attachmentIds: string[] }) {
    return this.disputes.addMessage(a, z.string().uuid().parse(id), body.message, body.attachmentIds);
  }

  @Post(':id/accept')
  accept(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.disputes.buyerAccept(a, z.string().uuid().parse(id));
  }

  @Post(':id/escalate')
  escalate(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ message: z.string().trim().min(5).max(2000) }))) body: { message: string }) {
    return this.disputes.escalate(a, z.string().uuid().parse(id), body.message);
  }
}

@SellerOnly()
@Controller('seller')
export class SellerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly disputes: DisputesService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('orders')
  list(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    return this.orders.listForSeller(a.store!.id, listQ.parse(q));
  }

  @Get('orders/:code')
  detail(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.detailForSeller(a.store!.id, code(c));
  }

  @Post('orders/:code/accept')
  accept(@Auth() a: AuthContext, @Param('code') c: string) {
    return this.orders.sellerAccept(a, code(c));
  }

  @Post('orders/:code/reject')
  reject(@Auth() a: AuthContext, @Param('code') c: string, @Body(Z(z.object({ reason: z.string().trim().min(5).max(500) }))) body: { reason: string }) {
    return this.orders.sellerReject(a, code(c), body.reason);
  }

  @Post('orders/:code/deliver')
  deliver(@Auth() a: AuthContext, @Param('code') c: string, @Body(Z(z.object({ note: z.string().trim().min(5).max(5000), uploadIds: z.array(z.string().uuid()).max(10).default([]) }))) body: { note: string; uploadIds: string[] }) {
    return this.orders.sellerDeliver(a, code(c), body);
  }

  @Get('disputes')
  disputesList(@Auth() a: AuthContext, @Query('status') status?: string) {
    return this.disputes.listForSeller(a.user.id, status || undefined);
  }

  @Post('disputes/:id/respond')
  respond(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ action: z.enum(['REPLACE', 'REFUND', 'REJECT']), amount: z.number().int().positive().optional(), message: z.string().trim().min(5).max(2000) })))
    body: { action: 'REPLACE' | 'REFUND' | 'REJECT'; amount?: number; message: string },
  ) {
    return this.disputes.sellerRespond(a, z.string().uuid().parse(id), body);
  }

  @Get('reviews')
  reviewsList(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    const p = z
      .object({ rating: z.coerce.number().int().min(1).max(5).optional(), unreplied: z.enum(['1', '0']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(q);
    return this.reviews.listForSeller(a.store!.id, { ...p, unreplied: p.unreplied === '1' });
  }

  @Post('reviews/:id/reply')
  reply(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ reply: z.string().trim().min(2).max(1000) }))) body: { reply: string }) {
    return this.reviews.reply(a, z.string().uuid().parse(id), body.reply);
  }
}
