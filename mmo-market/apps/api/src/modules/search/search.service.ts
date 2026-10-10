import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { toSearchText } from '../../common/text';
import { CatalogService } from '../catalog/catalog.service';

export type AttrFilter = { values?: string[]; min?: number; max?: number; bool?: boolean };

export interface SearchParams {
  q?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  delivery?: 'AUTO' | 'MANUAL';
  inStock?: boolean;
  ratingMin?: number;
  levels?: string[];
  warrantyMin?: number;
  store?: string;
  attrs: Record<string, AttrFilter>;
  sort?: 'relevance' | 'best_selling' | 'newest' | 'price_asc' | 'price_desc' | 'rating';
  page: number;
  pageSize: number;
}

type Dim = 'category' | 'delivery' | 'level' | `attr:${string}` | 'none';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

/**
 * Tìm kiếm & bộ lọc dùng PostgreSQL (pg_trgm + jsonb).
 * Facet kiểu "disjunctive": số đếm của mỗi nhóm lọc được tính với mọi bộ lọc khác, trừ chính nhóm đó.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async search(p: SearchParams) {
    const catInfo = p.category ? await this.catalog.bySlug(p.category).catch(() => null) : null;
    const attrDefs = catInfo ? catInfo.attributes.filter((a) => a.isFilterable) : [];
    const q = p.q ? toSearchText(p.q).slice(0, 100) : '';
    const tokens = q.split(' ').filter((t) => t.length > 0).slice(0, 8);

    const conds = (exclude: Dim): Prisma.Sql[] => {
      const c: Prisma.Sql[] = [
        Prisma.sql`p.status = 'ACTIVE'`,
        Prisma.sql`p."deletedAt" IS NULL`,
        Prisma.sql`s.status <> 'SUSPENDED'`,
      ];
      if (catInfo && exclude !== 'category') {
        const path = catInfo.category.path;
        c.push(Prisma.sql`(p."categoryPath" = ${path} OR p."categoryPath" LIKE ${escapeLike(path) + '/%'} ESCAPE '\\')`);
      }
      for (const t of tokens) c.push(Prisma.sql`p."searchText" LIKE ${'%' + escapeLike(t) + '%'} ESCAPE '\\'`);
      if (p.priceMin != null) c.push(Prisma.sql`p."priceMin" >= ${BigInt(Math.floor(p.priceMin))}`);
      if (p.priceMax != null) c.push(Prisma.sql`p."priceMin" <= ${BigInt(Math.ceil(p.priceMax))}`);
      if (p.delivery && exclude !== 'delivery') c.push(Prisma.sql`p."deliveryType"::text = ${p.delivery}`);
      if (p.inStock) c.push(Prisma.sql`(p."deliveryType" = 'MANUAL' OR p."stockTotal" > 0)`);
      if (p.ratingMin) c.push(Prisma.sql`p."ratingAvg" >= ${p.ratingMin}`);
      if (p.levels?.length && exclude !== 'level') c.push(Prisma.sql`s.level::text = ANY(${p.levels})`);
      if (p.warrantyMin) c.push(Prisma.sql`p."warrantyHours" >= ${p.warrantyMin}`);
      if (p.store) c.push(Prisma.sql`s.slug = ${p.store}`);
      for (const def of attrDefs) {
        const f = p.attrs[def.key];
        if (!f || exclude === `attr:${def.key}`) continue;
        const key = def.key;
        if ((def.type === 'SELECT' || def.type === 'TEXT') && f.values?.length) {
          c.push(Prisma.sql`p.attrs->>${key} = ANY(${f.values})`);
        } else if (def.type === 'MULTISELECT' && f.values?.length) {
          c.push(Prisma.sql`(jsonb_typeof(p.attrs->${key}) = 'array' AND (p.attrs->${key}) ?| ${f.values}::text[])`);
        } else if (def.type === 'BOOLEAN' && f.bool != null) {
          c.push(Prisma.sql`p.attrs->>${key} = ${f.bool ? 'true' : 'false'}`);
        } else if (def.type === 'NUMBER') {
          const num = Prisma.sql`(CASE WHEN jsonb_typeof(p.attrs->${key}) = 'number' THEN (p.attrs->>${key})::numeric END)`;
          if (f.min != null) c.push(Prisma.sql`${num} >= ${f.min}`);
          if (f.max != null) c.push(Prisma.sql`${num} <= ${f.max}`);
        }
      }
      return c;
    };
    const where = (exclude: Dim) => Prisma.join(conds(exclude), ' AND ');
    const FROM = Prisma.sql`FROM products p JOIN stores s ON s.id = p."storeId"`;

    const sort = p.sort ?? (tokens.length ? 'relevance' : 'best_selling');
    const order =
      sort === 'relevance' && q
        ? Prisma.sql`similarity(p."searchText", ${q}) DESC, p."soldCount" DESC`
        : sort === 'newest'
          ? Prisma.sql`p."createdAt" DESC`
          : sort === 'price_asc'
            ? Prisma.sql`p."priceMin" ASC, p."soldCount" DESC`
            : sort === 'price_desc'
              ? Prisma.sql`p."priceMin" DESC`
              : sort === 'rating'
                ? Prisma.sql`p."ratingAvg" DESC, p."ratingCount" DESC`
                : Prisma.sql`p."soldCount" DESC, p."ratingAvg" DESC`;

    const offset = (p.page - 1) * p.pageSize;

    const listQ = this.prisma.$queryRaw<any[]>`
      SELECT p.id, p.slug, p.title, p.images[1] AS image, p."priceMin", p."deliveryType", p."stockTotal", p."soldCount",
             p."ratingAvg", p."ratingCount", p."warrantyHours", p.attrs, p."categoryPath", p."createdAt",
             s.slug AS "storeSlug", s.name AS "storeName", s.level AS "storeLevel", s."ratingAvg" AS "storeRating"
      ${FROM} WHERE ${where('none')} ORDER BY ${order}, p.id LIMIT ${p.pageSize} OFFSET ${offset}`;
    const countQ = this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n ${FROM} WHERE ${where('none')}`;
    const priceQ = this.prisma.$queryRaw<{ min: bigint | null; max: bigint | null }[]>`
      SELECT min(p."priceMin") AS min, max(p."priceMin") AS max ${FROM} WHERE ${where('none')}`;
    const deliveryQ = this.prisma.$queryRaw<{ v: string; n: bigint }[]>`
      SELECT p."deliveryType"::text AS v, count(*) AS n ${FROM} WHERE ${where('delivery')} GROUP BY 1`;
    const levelQ = this.prisma.$queryRaw<{ v: string; n: bigint }[]>`
      SELECT s.level::text AS v, count(*) AS n ${FROM} WHERE ${where('level')} GROUP BY 1`;

    const parentId = catInfo?.category.id ?? null;
    const childQ = this.prisma.$queryRaw<{ id: string; slug: string; name: string; n: bigint }[]>`
      SELECT c.id, c.slug, c.name, count(p.id) AS n
      FROM categories c
      JOIN products p ON (p."categoryPath" = c.path OR p."categoryPath" LIKE c.path || '/%')
      JOIN stores s ON s.id = p."storeId"
      WHERE c."isActive" = true AND ${parentId ? Prisma.sql`c."parentId" = ${parentId}::uuid` : Prisma.sql`c."parentId" IS NULL`}
        AND ${where('category')}
      GROUP BY c.id, c.slug, c.name, c."sortOrder" ORDER BY c."sortOrder", c.name`;

    const attrQs = attrDefs.map((def) => {
      const key = def.key;
      if (def.type === 'NUMBER') {
        return this.prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
          SELECT min((p.attrs->>${key})::numeric)::float8 AS min, max((p.attrs->>${key})::numeric)::float8 AS max
          ${FROM} WHERE ${where(`attr:${key}`)} AND jsonb_typeof(p.attrs->${key}) = 'number'`;
      }
      if (def.type === 'MULTISELECT') {
        return this.prisma.$queryRaw<{ v: string; n: bigint }[]>`
          SELECT x.v, count(*) AS n ${FROM}
          CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.attrs->${key}) = 'array' THEN p.attrs->${key} ELSE '[]'::jsonb END) AS x(v)
          WHERE ${where(`attr:${key}`)} GROUP BY x.v`;
      }
      return this.prisma.$queryRaw<{ v: string; n: bigint }[]>`
        SELECT p.attrs->>${key} AS v, count(*) AS n ${FROM}
        WHERE ${where(`attr:${key}`)} AND p.attrs ? ${key} GROUP BY 1`;
    });

    const [items, count, price, delivery, level, children, ...attrRes] = await Promise.all([
      listQ, countQ, priceQ, deliveryQ, levelQ, childQ, ...attrQs,
    ]);

    const toCounts = (rows: { v: string; n: bigint }[]) => Object.fromEntries(rows.map((r) => [r.v, Number(r.n)]));
    const attrFacets = attrDefs.map((def, i) => {
      const rows = attrRes[i] as any[];
      if (def.type === 'NUMBER') return { ...def, range: { min: rows[0]?.min ?? null, max: rows[0]?.max ?? null } };
      const counts = toCounts(rows);
      if (def.type === 'BOOLEAN') return { ...def, counts };
      return { ...def, counts, options: def.options.map((o) => ({ ...o, count: counts[o.value] ?? 0 })) };
    });

    return {
      items: items.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        image: r.image,
        priceMin: Number(r.priceMin),
        deliveryType: r.deliveryType,
        stockTotal: r.stockTotal,
        soldCount: r.soldCount,
        ratingAvg: r.ratingAvg,
        ratingCount: r.ratingCount,
        warrantyHours: r.warrantyHours,
        attrs: r.attrs,
        store: { slug: r.storeSlug, name: r.storeName, level: r.storeLevel, ratingAvg: r.storeRating },
      })),
      total: Number(count[0]?.n ?? 0),
      page: p.page,
      pageSize: p.pageSize,
      sort,
      category: catInfo ? { ...catInfo.category, breadcrumbs: catInfo.breadcrumbs } : null,
      facets: {
        categories: children.map((c) => ({ id: c.id, slug: c.slug, name: c.name, count: Number(c.n) })),
        delivery: toCounts(delivery),
        levels: toCounts(level),
        price: { min: price[0]?.min != null ? Number(price[0].min) : null, max: price[0]?.max != null ? Number(price[0].max) : null },
        attributes: attrFacets,
      },
    };
  }

  async suggest(qRaw: string) {
    const q = toSearchText(qRaw).slice(0, 60);
    if (q.length < 2) return { products: [], stores: [], categories: [] };
    const like = '%' + escapeLike(q) + '%';
    const [products, stores, categories] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT p.id, p.title, p."priceMin", p.images[1] AS image FROM products p JOIN stores s ON s.id = p."storeId"
        WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND s.status <> 'SUSPENDED' AND p."searchText" LIKE ${like} ESCAPE '\\'
        ORDER BY similarity(p."searchText", ${q}) DESC, p."soldCount" DESC LIMIT 6`,
      this.prisma.store.findMany({
        where: { status: { not: 'SUSPENDED' }, OR: [{ name: { contains: qRaw.slice(0, 60), mode: 'insensitive' } }, { slug: { contains: q.replace(/\s+/g, '-') } }] },
        select: { slug: true, name: true, level: true, avatarUrl: true },
        take: 3,
      }),
      this.prisma.category.findMany({
        where: { isActive: true, OR: [{ name: { contains: qRaw.slice(0, 60), mode: 'insensitive' } }, { slug: { contains: q.replace(/\s+/g, '-') } }] },
        select: { slug: true, name: true, icon: true },
        take: 3,
      }),
    ]);
    return { products: products.map((p) => ({ ...p, priceMin: Number(p.priceMin) })), stores, categories };
  }
}
