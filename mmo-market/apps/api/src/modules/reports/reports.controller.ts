import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AdminArea, Auth, Perm, Public, RateLimit } from '../../common/decorators';
import { Z } from '../../common/zod.pipe';
import { REPORT_REASONS, REPORT_TARGETS, ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Public()
  @Get('reasons')
  reasons() {
    return Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label }));
  }

  @RateLimit({ name: 'report', limit: 20, windowSec: 3600, by: 'user' })
  @Post()
  create(
    @Auth() a: AuthContext,
    @Body(Z(z.object({ targetType: z.enum(REPORT_TARGETS), targetId: z.string().uuid(), reason: z.string(), detail: z.string().max(1000).optional() })))
    body: { targetType: string; targetId: string; reason: string; detail?: string },
  ) {
    return this.reports.create(a, body);
  }
}

@AdminArea()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Perm('community.moderate')
  @Get()
  list(@Query('status') status = 'OPEN', @Query('page') page = '1') {
    return this.reports.adminList(['OPEN', 'ACTIONED', 'DISMISSED'].includes(status) ? status : 'OPEN', Math.max(1, Number(page) || 1), 20);
  }

  @Perm('community.moderate')
  @Post(':id/handle')
  handle(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(z.object({ action: z.enum(['DISMISS', 'HIDE', 'LOCK_USER']), note: z.string().max(500).optional() }))) body: { action: 'DISMISS' | 'HIDE' | 'LOCK_USER'; note?: string }) {
    return this.reports.handle(a, z.string().uuid().parse(id), body.action, body.note);
  }
}
