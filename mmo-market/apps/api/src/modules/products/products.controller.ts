import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { Auth, Public, RateLimit, SellerOnly } from '../../common/decorators';
import { Z } from '../../common/zod.pipe';
import { ProductsService } from './products.service';

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  price: z.number().int().min(1000, 'Giá tối thiểu 1.000đ').max(1_000_000_000),
  compareAtPrice: z.number().int().positive().max(2_000_000_000).nullable().optional(),
  unitsPerPurchase: z.number().int().min(1).max(10_000).default(1),
  minQty: z.number().int().min(1).max(10_000).default(1),
  maxQty: z.number().int().min(1).max(10_000).default(1000),
  isActive: z.boolean().default(true),
});

export const productSchema = z.object({
  title: z.string().trim().min(8, 'Tên sản phẩm tối thiểu 8 ký tự').max(150),
  categoryId: z.string().uuid(),
  descriptionMd: z.string().trim().min(20, 'Mô tả tối thiểu 20 ký tự').max(20_000),
  deliveryType: z.enum(['AUTO', 'MANUAL']),
  warrantyHours: z.number().int().min(0).max(24 * 365),
  serviceSlaHours: z.number().int().min(1).max(24 * 90).nullable().optional(),
  buyerInputLabel: z.string().trim().max(200).nullable().optional(),
  stockFormat: z.string().trim().max(120).nullable().optional(),
  attrs: z.record(z.unknown()).default({}),
  imageUploadIds: z.array(z.string().uuid()).max(8).optional(),
  variants: z.array(variantSchema).min(1).max(20),
  submit: z.boolean().default(true),
});

const listQuery = z.object({
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'HIDDEN', 'REJECTED', 'BLOCKED']).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get(':id')
  detail(@Param('id') id: string, @Req() req: Request & { auth?: AuthContext }) {
    z.string().uuid().parse(id);
    return this.products.publicDetail(id, req.auth?.user.id ?? req.ip ?? 'anon');
  }

  @Public()
  @Get(':id/reviews')
  reviews(@Param('id') id: string, @Query() q: Record<string, string>) {
    const p = z
      .object({ rating: z.coerce.number().int().min(1).max(5).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(10) })
      .parse(q);
    return this.products.reviews(z.string().uuid().parse(id), p);
  }
}

@SellerOnly()
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Auth() a: AuthContext, @Query() q: Record<string, string>) {
    return this.products.sellerList(a.store!.id, listQuery.parse(q));
  }

  @Get(':id')
  detail(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.products.sellerDetail(a.store!.id, z.string().uuid().parse(id));
  }

  @RateLimit({ name: 'product-create', limit: 50, windowSec: 3600, by: 'user' })
  @Post()
  create(@Auth() a: AuthContext, @Body(Z(productSchema)) body: z.infer<typeof productSchema>) {
    return this.products.create(a.store!, a.user.id, body);
  }

  @Patch(':id')
  update(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(productSchema)) body: z.infer<typeof productSchema>) {
    return this.products.update(a.store!, a.user.id, z.string().uuid().parse(id), body);
  }

  @Post(':id/visibility')
  visibility(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ action: z.enum(['hide', 'show']) }))) body: { action: 'hide' | 'show' }) {
    return this.products.setVisibility(a.store!, z.string().uuid().parse(id), body.action);
  }

  @Post(':id/duplicate')
  duplicate(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.products.duplicate(a.store!, z.string().uuid().parse(id));
  }

  @Delete(':id')
  remove(@Auth() a: AuthContext, @Param('id') id: string) {
    return this.products.remove(a.store!, z.string().uuid().parse(id));
  }

  @Get(':id/stock')
  stock(@Auth() a: AuthContext, @Param('id') id: string, @Query() q: Record<string, string>) {
    const p = z
      .object({ status: z.enum(['AVAILABLE', 'SOLD', 'REVOKED']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(q);
    return this.products.listStock(a.store!, z.string().uuid().parse(id), p);
  }

  @RateLimit({ name: 'stock-import', limit: 60, windowSec: 3600, by: 'user' })
  @Post(':id/stock')
  importStock(
    @Auth() a: AuthContext,
    @Param('id') id: string,
    @Body(Z(z.object({ lines: z.string().max(5_000_000), dryRun: z.boolean().default(false) }))) body: { lines: string; dryRun: boolean },
  ) {
    return this.products.importStock(a.store!, a.user.id, z.string().uuid().parse(id), body.lines, body.dryRun);
  }
}

@SellerOnly()
@Controller('seller/stock')
export class SellerStockController {
  constructor(private readonly products: ProductsService) {}

  @Delete(':itemId')
  revoke(@Auth() a: AuthContext, @Param('itemId') itemId: string) {
    return this.products.revokeStock(a.store!, z.string().uuid().parse(itemId));
  }
}
