import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../../common/settings.service';
import { CatalogService } from '../catalog/catalog.service';
import { StoresService } from '../stores/stores.service';

const cardSelect = {
  id: true, slug: true, title: true, images: true, priceMin: true, deliveryType: true, stockTotal: true, soldCount: true,
  ratingAvg: true, ratingCount: true, warrantyHours: true, store: { select: { slug: true, name: true, level: true } },
} as const;

@Controller('home')
export class HomeController {
  private cache: { at: number; data: unknown } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly stores: StoresService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @Get()
  async home() {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.data;
    const active = { status: 'ACTIVE' as const, deletedAt: null, store: { status: { not: 'SUSPENDED' as const } } };
    const [categories, bestSellers, newest, posts, topStores, announcement, stats] = await Promise.all([
      this.catalog.tree(),
      this.prisma.product.findMany({ where: active, orderBy: [{ soldCount: 'desc' }, { ratingAvg: 'desc' }], take: 10, select: cardSelect }),
      this.prisma.product.findMany({ where: active, orderBy: { createdAt: 'desc' }, take: 10, select: cardSelect }),
      this.prisma.requestPost.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, title: true, budgetMin: true, budgetMax: true, quantity: true, offerCount: true, commentCount: true, deadlineAt: true, createdAt: true },
      }),
      this.stores.topStores(6),
      this.settings.get('site.announcement'),
      Promise.all([
        this.prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        this.prisma.store.count({ where: { status: { not: 'SUSPENDED' } } }),
        this.prisma.order.count({ where: { status: 'COMPLETED' } }),
      ]),
    ]);
    const card = (p: any) => ({ ...p, image: p.images[0] ?? null, images: undefined });
    const data = {
      announcement,
      categories,
      bestSellers: bestSellers.map(card),
      newest: newest.map(card),
      posts,
      topStores,
      stats: { products: stats[0], stores: stats[1], completedOrders: stats[2] },
    };
    this.cache = { at: Date.now(), data };
    return data;
  }
}

/** Kiểm tra sống cho Docker / load balancer: không lộ thông tin nội bộ. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
