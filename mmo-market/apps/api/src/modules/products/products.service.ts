import { Injectable } from '@nestjs/common';
import type { Prisma, Product, Store } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { asBytes } from '../../common/crypto/crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Errors } from '../../common/errors';
import { KeywordsService } from '../../common/keywords.service';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { SettingsService } from '../../common/settings.service';
import { StorageService } from '../../common/storage.service';
import { maskSecret, renderMarkdown, slugify, toSearchText } from '../../common/text';
import { CatalogService } from '../catalog/catalog.service';

export interface VariantInput {
  id?: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  unitsPerPurchase: number;
  minQty: number;
  maxQty: number;
  isActive: boolean;
}

export interface ProductInput {
  title: string;
  categoryId: string;
  descriptionMd: string;
  deliveryType: 'AUTO' | 'MANUAL';
  warrantyHours: number;
  serviceSlaHours?: number | null;
  buyerInputLabel?: string | null;
  stockFormat?: string | null;
  attrs: Record<string, unknown>;
  imageUploadIds: string[];
  variants: VariantInput[];
  submit: boolean;
}

const MAX_LINES = 50_000;

/** Che bớt tên người mua trong đánh giá công khai. */
export function maskName(name: string) {
  const t = name.trim();
  return t.length <= 2 ? t[0] + '*' : t.slice(0, 2) + '***' + t.slice(-1);
}
const MAX_LINE_LEN = 2000;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly keywords: KeywordsService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
  ) {}

  // ---------------- Seller: tạo / sửa ----------------

  private async prepare(store: Store, ownerId: string, input: ProductInput) {
    const category = await this.catalog.byId(input.categoryId);
    if (!category.isActive) throw Errors.bad('Danh mục đang tạm ẩn');
    const attrs = await this.catalog.validateAttrs(category.id, input.attrs ?? {});
    if (input.deliveryType === 'MANUAL' && !input.serviceSlaHours) {
      throw Errors.bad('Sản phẩm giao thủ công/dịch vụ cần thời gian hoàn thành cam kết');
    }
    if (!input.variants.length || input.variants.length > 20) throw Errors.bad('Cần 1-20 gói sản phẩm');
    if (!input.variants.some((v) => v.isActive)) throw Errors.bad('Cần ít nhất 1 gói đang bán');
    for (const v of input.variants) {
      if (v.minQty > v.maxQty) throw Errors.bad(`Gói "${v.name}": số lượng tối thiểu lớn hơn tối đa`);
      if (v.compareAtPrice != null && v.compareAtPrice <= v.price) throw Errors.bad(`Gói "${v.name}": giá gạch phải lớn hơn giá bán`);
    }
    const uploads = await this.storage.assertOwned(ownerId, input.imageUploadIds, ['product']);
    const kw = await this.keywords.check(input.title, input.descriptionMd);
    if (kw.action === 'BLOCK') {
      throw Errors.business('BANNED_CONTENT', `Nội dung chứa từ khoá bị cấm: ${kw.matched.join(', ')}`);
    }
    return {
      category,
      attrs,
      images: uploads.map((u) => this.storage.urlFor(u.key, true)),
      needsReview: kw.action === 'REVIEW',
      searchText: toSearchText(input.title, store.name, category.name),
    };
  }

  private async decideStatus(store: Store, submit: boolean, needsReview: boolean, approvedBefore: boolean) {
    if (!submit) return 'DRAFT' as const;
    const auto = await this.settings.get('product.autoApproveLevels');
    if (!needsReview && (approvedBefore || auto.includes(store.level))) return 'ACTIVE' as const;
    return 'PENDING_REVIEW' as const;
  }

  async create(store: Store, ownerId: string, input: ProductInput) {
    const prep = await this.prepare(store, ownerId, input);
    const status = await this.decideStatus(store, input.submit, prep.needsReview, false);
    const baseSlug = slugify(input.title);
    const exists = await this.prisma.product.count({ where: { storeId: store.id, slug: { startsWith: baseSlug } } });
    const slug = exists ? `${baseSlug}-${exists + 1}` : baseSlug;
    const product = await this.prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: prep.category.id,
        categoryPath: prep.category.path,
        slug,
        title: input.title,
        searchText: prep.searchText,
        descriptionMd: input.descriptionMd,
        descriptionHtml: renderMarkdown(input.descriptionMd),
        deliveryType: input.deliveryType,
        warrantyHours: input.warrantyHours,
        serviceSlaHours: input.deliveryType === 'MANUAL' ? input.serviceSlaHours : null,
        buyerInputLabel: input.deliveryType === 'MANUAL' ? input.buyerInputLabel : null,
        stockFormat: input.deliveryType === 'AUTO' ? input.stockFormat : null,
        attrs: prep.attrs as Prisma.InputJsonValue,
        images: prep.images,
        status,
        approvedAt: status === 'ACTIVE' ? new Date() : null,
        priceMin: BigInt(Math.min(...input.variants.filter((v) => v.isActive).map((v) => v.price))),
        variants: {
          create: input.variants.map((v, i) => ({
            name: v.name,
            price: BigInt(v.price),
            compareAtPrice: v.compareAtPrice != null ? BigInt(v.compareAtPrice) : null,
            unitsPerPurchase: input.deliveryType === 'AUTO' ? v.unitsPerPurchase : 1,
            minQty: v.minQty,
            maxQty: v.maxQty,
            isActive: v.isActive,
            sortOrder: i,
          })),
        },
      },
      include: { variants: true },
    });
    return product;
  }

  async update(store: Store, ownerId: string, productId: string, input: ProductInput) {
    const product = await this.ownProduct(store.id, productId);
    if (product.status === 'BLOCKED') throw Errors.forbidden('Sản phẩm đã bị khoá bởi quản trị viên');
    if (product.deliveryType !== input.deliveryType && (product.soldCount > 0 || product.stockTotal > 0)) {
      throw Errors.bad('Không thể đổi kiểu giao hàng khi đã có kho hoặc đơn hàng');
    }
    const prep = await this.prepare(store, ownerId, input);
    let status = product.status;
    if (input.submit && ['DRAFT', 'REJECTED', 'HIDDEN'].includes(product.status)) {
      status = await this.decideStatus(store, true, prep.needsReview, !!product.approvedAt);
    } else if (prep.needsReview && product.status === 'ACTIVE') {
      status = 'PENDING_REVIEW';
    }
    const existing = await this.prisma.productVariant.findMany({ where: { productId } });
    const keepIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
    for (const id of keepIds) if (!existing.some((e) => e.id === id)) throw Errors.bad('Gói sản phẩm không hợp lệ');

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId, id: { notIn: [...keepIds] } } });
      for (const [i, v] of input.variants.entries()) {
        const data = {
          name: v.name,
          price: BigInt(v.price),
          compareAtPrice: v.compareAtPrice != null ? BigInt(v.compareAtPrice) : null,
          unitsPerPurchase: input.deliveryType === 'AUTO' ? v.unitsPerPurchase : 1,
          minQty: v.minQty,
          maxQty: v.maxQty,
          isActive: v.isActive,
          sortOrder: i,
        };
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId } });
      }
      await tx.product.update({
        where: { id: productId },
        data: {
          title: input.title,
          categoryId: prep.category.id,
          categoryPath: prep.category.path,
          searchText: prep.searchText,
          descriptionMd: input.descriptionMd,
          descriptionHtml: renderMarkdown(input.descriptionMd),
          deliveryType: input.deliveryType,
          warrantyHours: input.warrantyHours,
          serviceSlaHours: input.deliveryType === 'MANUAL' ? input.serviceSlaHours : null,
          buyerInputLabel: input.deliveryType === 'MANUAL' ? input.buyerInputLabel : null,
          stockFormat: input.deliveryType === 'AUTO' ? input.stockFormat : null,
          attrs: prep.attrs as Prisma.InputJsonValue,
          images: prep.images,
          status,
          approvedAt: status === 'ACTIVE' && !product.approvedAt ? new Date() : product.approvedAt,
          priceMin: BigInt(Math.min(...input.variants.filter((v) => v.isActive).map((v) => v.price))),
        },
      });
    });
    return this.sellerDetail(store.id, productId);
  }

  async ownProduct(storeId: string, productId: string): Promise<Product> {
    const p = await this.prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
    if (!p) throw Errors.notFound('Sản phẩm');
    return p;
  }

  async setVisibility(store: Store, productId: string, action: 'hide' | 'show') {
    const p = await this.ownProduct(store.id, productId);
    if (p.status === 'BLOCKED') throw Errors.forbidden('Sản phẩm đã bị khoá bởi quản trị viên');
    if (action === 'hide') {
      if (!['ACTIVE', 'PENDING_REVIEW'].includes(p.status)) throw Errors.bad('Sản phẩm không ở trạng thái đang bán');
      await this.prisma.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } });
    } else {
      if (p.status !== 'HIDDEN') throw Errors.bad('Chỉ hiện lại được sản phẩm đang ẩn');
      await this.prisma.product.update({ where: { id: p.id }, data: { status: p.approvedAt ? 'ACTIVE' : 'PENDING_REVIEW' } });
    }
    return { ok: true };
  }

  async remove(store: Store, productId: string) {
    const p = await this.ownProduct(store.id, productId);
    const open = await this.prisma.order.count({ where: { productId: p.id, status: { in: ['PAID', 'IN_PROGRESS', 'DELIVERED', 'DISPUTED'] } } });
    if (open) throw Errors.business('PRODUCT_HAS_OPEN_ORDERS', 'Sản phẩm còn đơn hàng chưa hoàn tất');
    await this.prisma.$transaction([
      this.prisma.stockItem.updateMany({ where: { productId: p.id, status: 'AVAILABLE' }, data: { status: 'REVOKED' } }),
      this.prisma.product.update({ where: { id: p.id }, data: { deletedAt: new Date(), status: 'HIDDEN', stockTotal: 0 } }),
    ]);
    return { ok: true };
  }

  async duplicate(store: Store, productId: string) {
    const p = await this.prisma.product.findFirst({ where: { id: productId, storeId: store.id }, include: { variants: true } });
    if (!p) throw Errors.notFound('Sản phẩm');
    const slug = `${p.slug}-ban-sao-${Date.now().toString(36)}`;
    return this.prisma.product.create({
      data: {
        storeId: store.id,
        categoryId: p.categoryId,
        categoryPath: p.categoryPath,
        slug,
        title: `${p.title} (bản sao)`,
        searchText: p.searchText,
        descriptionMd: p.descriptionMd,
        descriptionHtml: p.descriptionHtml,
        deliveryType: p.deliveryType,
        warrantyHours: p.warrantyHours,
        serviceSlaHours: p.serviceSlaHours,
        buyerInputLabel: p.buyerInputLabel,
        stockFormat: p.stockFormat,
        attrs: p.attrs as Prisma.InputJsonValue,
        images: p.images,
        status: 'DRAFT',
        priceMin: p.priceMin,
        variants: {
          create: p.variants.map((v) => ({
            name: v.name, price: v.price, compareAtPrice: v.compareAtPrice, unitsPerPurchase: v.unitsPerPurchase,
            minQty: v.minQty, maxQty: v.maxQty, isActive: v.isActive, sortOrder: v.sortOrder,
          })),
        },
      },
    });
  }

  async sellerList(storeId: string, q: { status?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.ProductWhereInput = {
      storeId,
      deletedAt: null,
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.q ? { searchText: { contains: toSearchText(q.q) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { variants: { orderBy: { sortOrder: 'asc' } }, category: { select: { name: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async sellerDetail(storeId: string, productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      include: { variants: { orderBy: { sortOrder: 'asc' } }, category: true },
    });
    if (!p) throw Errors.notFound('Sản phẩm');
    return { ...p, attributes: await this.catalog.effectiveAttributes(p.categoryId) };
  }

  // ---------------- Kho hàng số ----------------

  /** Nhập kho: mỗi dòng 1 item. Phát hiện trùng trong lô, trùng kho hiện có và trùng hàng đã bán (toàn sàn). */
  async importStock(store: Store, userId: string, productId: string, text: string, dryRun: boolean) {
    const product = await this.ownProduct(store.id, productId);
    if (product.deliveryType !== 'AUTO') throw Errors.bad('Chỉ sản phẩm giao tự động mới có kho');
    if (product.status === 'BLOCKED') throw Errors.forbidden('Sản phẩm đã bị khoá');
    const rawLines = text.split(/\r?\n/);
    if (rawLines.length > MAX_LINES) throw Errors.bad(`Tối đa ${MAX_LINES.toLocaleString('vi-VN')} dòng mỗi lần nhập`);

    const seen = new Set<string>();
    const invalid: { line: number; reason: string }[] = [];
    const candidates: { line: number; content: string; hmac: Buffer }[] = [];
    let dupInBatch = 0;
    rawLines.forEach((raw, idx) => {
      const content = raw.trim();
      if (!content) return;
      if (content.length > MAX_LINE_LEN) {
        invalid.push({ line: idx + 1, reason: `Dài quá ${MAX_LINE_LEN} ký tự` });
        return;
      }
      const hmac = this.crypto.stockHmac(content);
      const hex = hmac.toString('hex');
      if (seen.has(hex)) {
        dupInBatch++;
        return;
      }
      seen.add(hex);
      candidates.push({ line: idx + 1, content, hmac });
    });

    const existing = new Set<string>();
    for (let i = 0; i < candidates.length; i += 1000) {
      const chunk = candidates.slice(i, i + 1000).map((c) => asBytes(c.hmac));
      const rows = await this.prisma.stockItem.findMany({ where: { contentHmac: { in: chunk } }, select: { contentHmac: true } });
      for (const r of rows) existing.add(Buffer.from(r.contentHmac).toString('hex'));
    }
    const fresh = candidates.filter((c) => !existing.has(c.hmac.toString('hex')));
    const result = {
      totalLines: rawLines.filter((l) => l.trim()).length,
      accepted: fresh.length,
      duplicatesInBatch: dupInBatch,
      duplicatesExisting: candidates.length - fresh.length,
      invalid: invalid.slice(0, 100),
      invalidCount: invalid.length,
      preview: fresh.slice(0, 5).map((c) => maskSecret(c.content)),
    };
    if (dryRun || fresh.length === 0) return { ...result, saved: false };

    const { dek, wrapped } = this.crypto.newDek();
    const batch = await this.prisma.stockBatch.create({
      data: {
        productId,
        uploadedById: userId,
        dekWrapped: wrapped,
        totalLines: result.totalLines,
        accepted: 0,
        duplicates: result.duplicatesInBatch + result.duplicatesExisting,
        invalid: invalid.length,
      },
    });
    let inserted = 0;
    for (let i = 0; i < fresh.length; i += 1000) {
      const rows = fresh.slice(i, i + 1000).map((c) => {
        const id = randomUUID();
        return {
          id,
          productId,
          batchId: batch.id,
          contentEnc: this.crypto.encryptStock(dek, id, productId, c.content),
          contentHmac: asBytes(c.hmac),
          preview: maskSecret(c.content),
        };
      });
      const r = await this.prisma.stockItem.createMany({ data: rows, skipDuplicates: true });
      inserted += r.count;
    }
    await this.prisma.stockBatch.update({ where: { id: batch.id }, data: { accepted: inserted } });
    await this.recountStock(productId);
    return { ...result, accepted: inserted, saved: true, batchId: batch.id };
  }

  async recountStock(productId: string) {
    const n = await this.prisma.stockItem.count({ where: { productId, status: 'AVAILABLE' } });
    await this.prisma.product.update({ where: { id: productId }, data: { stockTotal: n } });
    return n;
  }

  async listStock(store: Store, productId: string, q: { status?: string; page: number; pageSize: number }) {
    await this.ownProduct(store.id, productId);
    const where: Prisma.StockItemWhereInput = { productId, ...(q.status ? { status: q.status as any } : {}) };
    const [items, total, batches] = await Promise.all([
      this.prisma.stockItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, preview: true, status: true, soldAt: true, createdAt: true, orderId: true },
      }),
      this.prisma.stockItem.count({ where }),
      this.prisma.stockBatch.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, totalLines: true, accepted: true, duplicates: true, invalid: true, createdAt: true },
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize, batches };
  }

  async revokeStock(store: Store, itemId: string) {
    const item = await this.prisma.stockItem.findUnique({ where: { id: itemId }, include: { product: true } });
    if (!item || item.product.storeId !== store.id) throw Errors.notFound('Item');
    if (item.status !== 'AVAILABLE') throw Errors.bad('Chỉ thu hồi được item chưa bán');
    const r = await this.prisma.stockItem.updateMany({ where: { id: itemId, status: 'AVAILABLE' }, data: { status: 'REVOKED' } });
    if (r.count !== 1) throw Errors.conflict('STOCK_CHANGED', 'Item vừa được bán, không thể thu hồi');
    await this.recountStock(item.productId);
    return { ok: true };
  }

  // ---------------- Công khai ----------------

  async publicDetail(productId: string, viewerKey: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: 'ACTIVE' },
      include: {
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        category: true,
        store: { include: { owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
      },
    });
    if (!p || p.store.status === 'SUSPENDED') throw Errors.notFound('Sản phẩm');
    const viewKey = `pv:${p.id}:${viewerKey}`;
    if (await this.redis.client.set(viewKey, '1', 'EX', 3600, 'NX')) {
      await this.prisma.product.update({ where: { id: p.id }, data: { viewCount: { increment: 1 } } });
    }
    const [attributes, catInfo, ratingDist, online] = await Promise.all([
      this.catalog.effectiveAttributes(p.categoryId),
      this.catalog.bySlug(p.category.slug).catch(() => null),
      this.prisma.review.groupBy({ by: ['rating'], where: { productId: p.id, status: 'VISIBLE' }, _count: true }),
      this.redis.client.exists(`presence:${p.store.ownerId}`),
    ]);
    const attrList = attributes
      .filter((a) => (p.attrs as Record<string, unknown>)[a.key] !== undefined)
      .map((a) => {
        const v = (p.attrs as Record<string, unknown>)[a.key];
        const label = (val: unknown) => a.options.find((o) => o.value === val)?.label ?? String(val);
        const display =
          a.type === 'BOOLEAN' ? (v ? 'Có' : 'Không') : a.type === 'MULTISELECT' ? (v as string[]).map(label).join(', ') : a.type === 'SELECT' ? label(v) : `${v}${a.unit ? ' ' + a.unit : ''}`;
        return { key: a.key, label: a.label, value: v, display };
      });
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      descriptionHtml: p.descriptionHtml,
      deliveryType: p.deliveryType,
      warrantyHours: p.warrantyHours,
      serviceSlaHours: p.serviceSlaHours,
      buyerInputLabel: p.buyerInputLabel,
      images: p.images,
      priceMin: p.priceMin,
      stockTotal: p.stockTotal,
      soldCount: p.soldCount,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      viewCount: p.viewCount,
      createdAt: p.createdAt,
      attributes: attrList,
      breadcrumbs: catInfo?.breadcrumbs ?? [{ slug: p.category.slug, name: p.category.name }],
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        unitsPerPurchase: v.unitsPerPurchase,
        minQty: v.minQty,
        maxQty: v.maxQty,
        available: p.deliveryType === 'AUTO' ? Math.floor(p.stockTotal / v.unitsPerPurchase) : null,
      })),
      ratingDistribution: Object.fromEntries(ratingDist.map((r) => [r.rating, r._count])),
      store: {
        id: p.store.id,
        slug: p.store.slug,
        name: p.store.name,
        avatarUrl: p.store.avatarUrl,
        level: p.store.level,
        status: p.store.status,
        vacationUntil: p.store.vacationUntil,
        ratingAvg: p.store.ratingAvg,
        ratingCount: p.store.ratingCount,
        soldCount: p.store.soldCount,
        completedOrders: p.store.completedOrders,
        disputeRatePct: p.store.completedOrders ? Math.round((p.store.disputeCount / Math.max(1, p.store.completedOrders)) * 1000) / 10 : 0,
        createdAt: p.store.createdAt,
        ownerId: p.store.owner.id,
        online: online === 1,
      },
    };
  }

  async reviews(productId: string, q: { rating?: number; page: number; pageSize: number }) {
    const where: Prisma.ReviewWhereInput = { productId, status: 'VISIBLE', ...(q.rating ? { rating: q.rating } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { order: { select: { variantName: true, buyer: { select: { username: true, displayName: true, avatarUrl: true } } } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        content: r.content,
        sellerReply: r.sellerReply,
        sellerRepliedAt: r.sellerRepliedAt,
        createdAt: r.createdAt,
        variantName: r.order.variantName,
        buyer: { displayName: maskName(r.order.buyer.displayName), avatarUrl: r.order.buyer.avatarUrl },
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
