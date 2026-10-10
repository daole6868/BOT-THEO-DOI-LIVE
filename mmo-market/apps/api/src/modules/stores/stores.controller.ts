import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm, Public, RateLimit, SellerOnly } from '../../common/decorators';
import { hasPermission } from '../../common/permissions';
import { Z } from '../../common/zod.pipe';
import { BANKS, StoresService } from './stores.service';

const applicationSchema = z.object({
  storeName: z.string().trim().min(3).max(50),
  storeSlug: z.string().trim().max(40).optional(),
  mainCategoryId: z.string().uuid().optional(),
  description: z.string().trim().min(20, 'Mô tả tối thiểu 20 ký tự').max(2000),
  contact: z.string().trim().max(200).optional(),
  fullName: z.string().trim().min(4).max(80),
  idNumber: z.string().regex(/^\d{9}$|^\d{12}$/, 'Số CCCD/CMND gồm 9 hoặc 12 chữ số'),
  idFrontUploadId: z.string().uuid(),
  idBackUploadId: z.string().uuid(),
  selfieUploadId: z.string().uuid(),
  bankCode: z.string().regex(/^\d{6}$/),
  bankAccount: z.string().regex(/^\d{6,19}$/, 'Số tài khoản không hợp lệ'),
  bankHolderName: z.string().trim().min(4).max(80),
});

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Public()
  @Get('top')
  top() {
    return this.stores.topStores();
  }

  @Public()
  @Get('banks')
  banks() {
    return Object.entries(BANKS).map(([code, name]) => ({ code, name }));
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string, @Req() req: Request & { auth?: AuthContext }) {
    return this.stores.publicStore(slug, req.auth?.user.id);
  }

  @Public()
  @Get(':slug/reviews')
  reviews(@Param('slug') slug: string, @Query('page') page = '1') {
    return this.stores.storeReviews(slug, Math.max(1, Number(page) || 1), 10);
  }

  @Post(':slug/follow')
  follow(@Auth() a: AuthContext, @Param('slug') slug: string) {
    return this.stores.follow(slug, a.user.id, true);
  }

  @Delete(':slug/follow')
  unfollow(@Auth() a: AuthContext, @Param('slug') slug: string) {
    return this.stores.follow(slug, a.user.id, false);
  }
}

@Controller('seller-applications')
export class SellerApplicationsController {
  constructor(private readonly stores: StoresService) {}

  @Get('me')
  mine(@Auth() a: AuthContext) {
    return this.stores.myApplication(a.user.id);
  }

  @RateLimit({ name: 'apply', limit: 5, windowSec: 3600, by: 'user' })
  @Post()
  apply(@Auth() a: AuthContext, @Body(Z(applicationSchema)) body: z.infer<typeof applicationSchema>) {
    return this.stores.apply(a, body);
  }
}

@SellerOnly()
@Controller('seller/store')
export class SellerStoreController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  get(@Auth() a: AuthContext) {
    return a.store;
  }

  @Patch()
  update(
    @Auth() a: AuthContext,
    @Body(
      Z(
        z.object({
          description: z.string().max(5000).optional(),
          policy: z.string().max(5000).optional(),
          avatarUploadId: z.string().uuid().nullable().optional(),
          bannerUploadId: z.string().uuid().nullable().optional(),
          defaultWarrantyHours: z.number().int().min(0).max(24 * 365).optional(),
        }),
      ),
    )
    body: any,
  ) {
    return this.stores.updateStore(a, body);
  }

  @Post('vacation')
  vacation(@Auth() a: AuthContext, @Body(Z(z.object({ until: z.coerce.date().nullable() }))) body: { until: Date | null }) {
    return this.stores.setVacation(a, body.until);
  }
}

@AdminArea()
@Controller('admin/seller-applications')
export class AdminSellerApplicationsController {
  constructor(private readonly stores: StoresService) {}

  @Perm('seller.review')
  @Get()
  list(@Query('status') status?: string, @Query('page') page = '1') {
    return this.stores.adminList(status || undefined, Math.max(1, Number(page) || 1), 20);
  }

  @Perm('seller.review')
  @Get(':id')
  detail(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.stores.adminDetail(z.string().uuid().parse(id), a, hasPermission(a.user.role?.permissions, 'kyc.view'));
  }

  @Perm('seller.review')
  @Post(':id/decision')
  decide(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ decision: z.enum(['approve', 'reject', 'need_info']), note: z.string().max(1000).optional() }))) body: { decision: 'approve' | 'reject' | 'need_info'; note?: string },
  ) {
    return this.stores.adminDecide(z.string().uuid().parse(id), a, body.decision, body.note);
  }
}
