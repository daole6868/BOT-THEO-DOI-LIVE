import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../../common/auth.types';
import { Auth, SellerOnly } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';

@SellerOnly()
@Controller('seller/dashboard')
export class SellerDashboardController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@Auth() a: AuthContext, @Query('range') range = '30') {
    const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
    return this.analytics.seller(a.store!.id, a.user.id, days);
  }
}
