import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { Auth, Public, RateLimit, SellerOnly } from '../../common/decorators';
import { requireIdemKey } from '../../common/util';
import { Z } from '../../common/zod.pipe';
import { BoardService } from './board.service';

const postSchema = z.object({
  title: z.string().trim().min(10, 'Tiêu đề tối thiểu 10 ký tự').max(150),
  categoryId: z.string().uuid(),
  bodyMd: z.string().trim().min(20, 'Mô tả tối thiểu 20 ký tự').max(10_000),
  budgetMin: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  budgetMax: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  quantity: z.number().int().min(1).max(1_000_000).nullable().optional(),
  deadlineDays: z.number().int().min(1).max(60).default(7),
  offerVisibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
});

const uuid = (v: string) => z.string().uuid().parse(v);

@Controller('requests')
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Public()
  @Get()
  list(@Query() q: Record<string, string>, @Req() req: Request & { auth?: AuthContext }) {
    const p = z
      .object({
        category: z.string().max(80).optional(),
        q: z.string().max(100).optional(),
        status: z.enum(['OPEN', 'FULFILLED', 'CLOSED', 'EXPIRED', 'PENDING_REVIEW', 'HIDDEN']).optional(),
        budgetMin: z.coerce.number().int().min(0).optional(),
        budgetMax: z.coerce.number().int().min(0).optional(),
        sort: z.enum(['newest', 'most_offers', 'ending_soon', 'most_comments']).optional(),
        author: z.enum(['me']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(q);
    if (p.status && ['PENDING_REVIEW', 'HIDDEN'].includes(p.status) && p.author !== 'me') p.status = undefined;
    return this.board.listPosts(p, req.auth?.user.id);
  }

  @RateLimit({ name: 'post', limit: 10, windowSec: 3600, by: 'user' })
  @Post()
  create(@Auth() a: AuthContext, @Body(Z(postSchema)) body: z.infer<typeof postSchema>) {
    return this.board.createPost(a, body);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request & { auth?: AuthContext }) {
    return this.board.getPost(uuid(id), req.auth);
  }

  @Patch(':id')
  update(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(postSchema.partial())) body: any) {
    return this.board.updatePost(a, uuid(id), body);
  }

  @Post(':id/close')
  close(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.board.closePost(a, uuid(id));
  }

  @Post(':id/extend')
  extend(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ days: z.number().int().min(1).max(30) }))) body: { days: number }) {
    return this.board.extendPost(a, uuid(id), body.days);
  }

  @Public()
  @Get(':id/comments')
  comments(@Param('id') id: string, @Query('cursor') cursor: string | undefined, @Req() req: Request & { auth?: AuthContext }) {
    return this.board.listComments(uuid(id), req.auth?.user.id, cursor && !isNaN(Date.parse(cursor)) ? cursor : undefined);
  }

  @RateLimit({ name: 'comment', limit: 10, windowSec: 60, by: 'user' }, { name: 'comment-day', limit: 200, windowSec: 86400, by: 'user' })
  @Post(':id/comments')
  comment(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ body: z.string().trim().min(1).max(2000), parentId: z.string().uuid().optional() }))) body: { body: string; parentId?: string }) {
    return this.board.createComment(a, uuid(id), body.body, body.parentId);
  }

  @Public()
  @Get(':id/offers')
  offers(@Param('id') id: string, @Req() req: Request & { auth?: AuthContext }) {
    return this.board.listOffers(uuid(id), req.auth);
  }

  @RateLimit({ name: 'offer', limit: 50, windowSec: 86400, by: 'user' })
  @Post(':id/offers')
  offer(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ price: z.number().int().min(1000).max(10_000_000_000), deliveryHours: z.number().int().min(1).max(24 * 60), message: z.string().trim().min(10).max(3000), productId: z.string().uuid().optional() })))
    body: { price: number; deliveryHours: number; message: string; productId?: string },
  ) {
    return this.board.upsertOffer(a, uuid(id), body);
  }
}

@Controller('comments')
export class CommentsController {
  constructor(private readonly board: BoardService) {}

  @Public()
  @Get(':id/replies')
  replies(@Param('id') id: string, @Query('after') after: string | undefined, @Req() req: Request & { auth?: AuthContext }) {
    return this.board.listReplies(uuid(id), req.auth?.user.id, after && !isNaN(Date.parse(after)) ? after : undefined);
  }

  @Patch(':id')
  edit(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ body: z.string().trim().min(1).max(2000) }))) body: { body: string }) {
    return this.board.editComment(a, uuid(id), body.body);
  }

  @Delete(':id')
  remove(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.board.deleteComment(a, uuid(id));
  }

  @RateLimit({ name: 'like', limit: 60, windowSec: 60, by: 'user' })
  @Post(':id/like')
  like(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.board.toggleLike(a, uuid(id), true);
  }

  @Delete(':id/like')
  unlike(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.board.toggleLike(a, uuid(id), false);
  }
}

@Controller('offers')
export class OffersController {
  constructor(private readonly board: BoardService) {}

  @Post(':id/withdraw')
  withdraw(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.board.withdrawOffer(a, uuid(id));
  }

  @Post(':id/accept')
  accept(@Auth() a: AuthContext, @Param('id') id: string, @Headers() h: Record<string, string>) {
    return this.board.acceptOffer(a, uuid(id), requireIdemKey(h));
  }
}

@SellerOnly()
@Controller('seller/offers')
export class SellerOffersController {
  constructor(private readonly board: BoardService) {}

  @Get()
  list(@Auth() a: AuthContext) {
    return this.board.sellerOffers(a.user.id);
  }
}
