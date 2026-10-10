import { Injectable } from '@nestjs/common';
import type { Category, CategoryAttribute, Prisma } from '@prisma/client';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { slugify } from '../../common/text';

export interface CategoryNode {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  path: string;
  sortOrder: number;
  feeBps: number;
  defaultDelivery: string;
  isActive: boolean;
  productCount: number;
  children: CategoryNode[];
}

type AttrOption = { value: string; label: string };

@Injectable()
export class CatalogService {
  private treeCache: { at: number; all: Category[]; attrs: CategoryAttribute[]; counts: Map<string, number> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidate() {
    this.treeCache = null;
  }

  private async load() {
    if (this.treeCache && Date.now() - this.treeCache.at < 60_000) return this.treeCache;
    const [all, attrs, grouped] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.categoryAttribute.findMany({ orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }),
      this.prisma.product.groupBy({ by: ['categoryId'], where: { status: 'ACTIVE', deletedAt: null }, _count: true }),
    ]);
    const direct = new Map(grouped.map((g) => [g.categoryId, g._count]));
    const counts = new Map<string, number>();
    for (const c of all) {
      let total = 0;
      for (const d of all) if (d.path === c.path || d.path.startsWith(c.path + '/')) total += direct.get(d.id) ?? 0;
      counts.set(c.id, total);
    }
    this.treeCache = { at: Date.now(), all, attrs, counts };
    return this.treeCache;
  }

  async tree(includeInactive = false): Promise<CategoryNode[]> {
    const { all, counts } = await this.load();
    const nodes = new Map<string, CategoryNode>();
    for (const c of all) {
      if (!includeInactive && !c.isActive) continue;
      nodes.set(c.id, { ...c, productCount: counts.get(c.id) ?? 0, children: [] });
    }
    const roots: CategoryNode[] = [];
    for (const n of nodes.values()) {
      if (n.parentId && nodes.has(n.parentId)) nodes.get(n.parentId)!.children.push(n);
      else if (!n.parentId) roots.push(n);
    }
    return roots;
  }

  async bySlug(slug: string) {
    const { all, counts } = await this.load();
    const cat = all.find((c) => c.slug === slug && c.isActive);
    if (!cat) throw Errors.notFound('Danh mục');
    const ancestors = this.ancestors(all, cat);
    const children = all
      .filter((c) => c.parentId === cat.id && c.isActive)
      .map((c) => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon, productCount: counts.get(c.id) ?? 0 }));
    return {
      category: { ...cat, productCount: counts.get(cat.id) ?? 0 },
      breadcrumbs: [...ancestors, cat].map((c) => ({ slug: c.slug, name: c.name })),
      children,
      attributes: await this.effectiveAttributes(cat.id),
    };
  }

  async byId(id: string) {
    const { all } = await this.load();
    const cat = all.find((c) => c.id === id);
    if (!cat) throw Errors.notFound('Danh mục');
    return cat;
  }

  private ancestors(all: Category[], cat: Category): Category[] {
    const chain: Category[] = [];
    let cur = cat.parentId ? all.find((c) => c.id === cat.parentId) : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? all.find((c) => c.id === cur!.parentId) : undefined;
    }
    return chain;
  }

  /** Thuộc tính của danh mục + kế thừa từ danh mục cha. */
  async effectiveAttributes(categoryId: string) {
    const { all, attrs } = await this.load();
    const cat = all.find((c) => c.id === categoryId);
    if (!cat) return [];
    const ids = [...this.ancestors(all, cat).map((c) => c.id), cat.id];
    return attrs
      .filter((a) => ids.includes(a.categoryId))
      .map((a) => ({
        id: a.id,
        key: a.key,
        label: a.label,
        type: a.type,
        options: (a.options as AttrOption[] | null) ?? [],
        unit: a.unit,
        isRequired: a.isRequired,
        isFilterable: a.isFilterable,
        sortOrder: a.sortOrder,
        categoryId: a.categoryId,
      }));
  }

  /** Kiểm tra & làm sạch thuộc tính sản phẩm theo định nghĩa danh mục. */
  async validateAttrs(categoryId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const defs = await this.effectiveAttributes(categoryId);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (!defs.some((d) => d.key === key)) throw Errors.bad(`Thuộc tính "${key}" không thuộc danh mục này`);
    }
    for (const d of defs) {
      const v = input[d.key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        if (d.isRequired) throw Errors.bad(`Thiếu thuộc tính bắt buộc: ${d.label}`);
        continue;
      }
      const allowed = new Set(d.options.map((o) => o.value));
      switch (d.type) {
        case 'SELECT':
          if (typeof v !== 'string' || !allowed.has(v)) throw Errors.bad(`Giá trị không hợp lệ cho ${d.label}`);
          out[d.key] = v;
          break;
        case 'MULTISELECT':
          if (!Array.isArray(v) || v.length > 20 || v.some((x) => typeof x !== 'string' || !allowed.has(x))) {
            throw Errors.bad(`Giá trị không hợp lệ cho ${d.label}`);
          }
          out[d.key] = [...new Set(v as string[])];
          break;
        case 'NUMBER': {
          const n = typeof v === 'number' ? v : Number(v);
          if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw Errors.bad(`${d.label} phải là số`);
          out[d.key] = n;
          break;
        }
        case 'BOOLEAN':
          if (typeof v !== 'boolean') throw Errors.bad(`${d.label} phải là có/không`);
          out[d.key] = v;
          break;
        case 'TEXT':
          if (typeof v !== 'string' || v.length > 100) throw Errors.bad(`${d.label} tối đa 100 ký tự`);
          out[d.key] = v.trim();
          break;
      }
    }
    return out;
  }

  // ---------------- Quản trị danh mục ----------------

  async create(input: { name: string; slug?: string; parentId?: string | null; icon?: string | null; description?: string | null; feeBps: number; defaultDelivery: 'AUTO' | 'MANUAL'; sortOrder?: number }) {
    const slug = slugify(input.slug || input.name);
    const parent = input.parentId ? await this.prisma.category.findUnique({ where: { id: input.parentId } }) : null;
    if (input.parentId && !parent) throw Errors.notFound('Danh mục cha');
    if (parent && parent.path.split('/').length >= 3) throw Errors.bad('Tối đa 3 cấp danh mục');
    const cat = await this.prisma.category.create({
      data: {
        name: input.name,
        slug,
        parentId: parent?.id ?? null,
        icon: input.icon,
        description: input.description,
        path: parent ? `${parent.path}/${slug}` : slug,
        feeBps: input.feeBps,
        defaultDelivery: input.defaultDelivery,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    this.invalidate();
    return cat;
  }

  async update(id: string, input: Partial<{ name: string; slug: string; parentId: string | null; icon: string | null; description: string | null; feeBps: number; defaultDelivery: 'AUTO' | 'MANUAL'; sortOrder: number; isActive: boolean }>) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw Errors.notFound('Danh mục');
    const slug = input.slug ? slugify(input.slug) : cat.slug;
    let parentPath: string | null = null;
    const parentId = input.parentId === undefined ? cat.parentId : input.parentId;
    if (parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) throw Errors.notFound('Danh mục cha');
      if (parent.path === cat.path || parent.path.startsWith(cat.path + '/')) throw Errors.bad('Không thể chuyển danh mục vào chính nó');
      parentPath = parent.path;
    }
    const newPath = parentPath ? `${parentPath}/${slug}` : slug;
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.CategoryUpdateInput = {
        name: input.name,
        slug,
        icon: input.icon,
        description: input.description,
        feeBps: input.feeBps,
        defaultDelivery: input.defaultDelivery,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        path: newPath,
        parent: parentId ? { connect: { id: parentId } } : { disconnect: true },
      };
      await tx.category.update({ where: { id }, data });
      if (newPath !== cat.path) {
        // Cập nhật đường dẫn của cây con và sản phẩm
        await tx.$executeRaw`UPDATE categories SET path = ${newPath} || substring(path from ${cat.path.length + 1}) WHERE path LIKE ${cat.path + '/%'}`;
        await tx.$executeRaw`UPDATE products SET "categoryPath" = ${newPath} || substring("categoryPath" from ${cat.path.length + 1}) WHERE "categoryPath" = ${cat.path} OR "categoryPath" LIKE ${cat.path + '/%'}`;
      }
    });
    this.invalidate();
    return this.prisma.category.findUnique({ where: { id } });
  }

  async remove(id: string) {
    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children || products) throw Errors.business('CATEGORY_IN_USE', 'Danh mục còn danh mục con hoặc sản phẩm, hãy ẩn thay vì xoá');
    await this.prisma.category.delete({ where: { id } });
    this.invalidate();
    return { ok: true };
  }
}
