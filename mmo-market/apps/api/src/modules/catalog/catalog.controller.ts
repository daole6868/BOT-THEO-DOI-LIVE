import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth.types';
import { AuditService } from '../../common/audit.service';
import { AdminArea, Auth, Perm, Public } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { Z } from '../../common/zod.pipe';
import { CatalogService } from './catalog.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  tree() {
    return this.catalog.tree();
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.catalog.bySlug(slug);
  }

  @Public()
  @Get('id/:id/attributes')
  attributes(@Param('id') id: string) {
    return this.catalog.effectiveAttributes(z.string().uuid().parse(id));
  }
}

const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(60).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  feeBps: z.number().int().min(0).max(5000),
  defaultDelivery: z.enum(['AUTO', 'MANUAL']),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

const optionSchema = z.object({ value: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.+-]+$/), label: z.string().trim().min(1).max(60) });
const attributeSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Khoá chỉ gồm chữ thường, số, gạch dưới'),
  label: z.string().trim().min(1).max(60),
  type: z.enum(['SELECT', 'MULTISELECT', 'NUMBER', 'BOOLEAN', 'TEXT']),
  options: z.array(optionSchema).max(100).optional(),
  unit: z.string().max(20).nullable().optional(),
  isRequired: z.boolean().default(false),
  isFilterable: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

@AdminArea()
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Perm('category.manage')
  @Get()
  async list() {
    const [tree, attrs] = await Promise.all([this.catalog.tree(true), this.prisma.categoryAttribute.findMany({ orderBy: { sortOrder: 'asc' } })]);
    return { tree, attributes: attrs };
  }

  @Perm('category.manage')
  @Post()
  async create(@Auth() a: AuthContext, @Body(Z(categorySchema)) body: z.infer<typeof categorySchema>) {
    const c = await this.catalog.create(body);
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'category.create', targetType: 'category', targetId: c.id, data: body });
    return c;
  }

  @Perm('category.manage')
  @Patch(':id')
  async update(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(categorySchema.partial())) body: z.infer<typeof categorySchema>) {
    const c = await this.catalog.update(z.string().uuid().parse(id), body);
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'category.update', targetType: 'category', targetId: id, data: body });
    return c;
  }

  @Perm('category.manage')
  @Delete(':id')
  async remove(@Auth() a: AuthContext, @Param('id') id: string) {
    const r = await this.catalog.remove(z.string().uuid().parse(id));
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'category.delete', targetType: 'category', targetId: id });
    return r;
  }

  @Perm('category.manage')
  @Post(':id/attributes')
  async addAttr(@Auth() a: AuthContext, @Param('id') id: string, @Body(Z(attributeSchema)) body: z.infer<typeof attributeSchema>) {
    if ((body.type === 'SELECT' || body.type === 'MULTISELECT') && !body.options?.length) throw Errors.bad('Kiểu lựa chọn cần ít nhất 1 giá trị');
    const attr = await this.prisma.categoryAttribute.create({
      data: { ...body, categoryId: z.string().uuid().parse(id), options: (body.options ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    this.catalog.invalidate();
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'attribute.create', targetType: 'attribute', targetId: attr.id, data: body });
    return attr;
  }

  @Perm('category.manage')
  @Patch('attributes/:attrId')
  async updateAttr(@Auth() a: AuthContext, @Param('attrId') attrId: string, @Body(Z(attributeSchema.omit({ key: true }).partial())) body: any) {
    const attr = await this.prisma.categoryAttribute.update({ where: { id: z.string().uuid().parse(attrId) }, data: body });
    this.catalog.invalidate();
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'attribute.update', targetType: 'attribute', targetId: attrId, data: body });
    return attr;
  }

  @Perm('category.manage')
  @Delete('attributes/:attrId')
  async removeAttr(@Auth() a: AuthContext, @Param('attrId') attrId: string) {
    await this.prisma.categoryAttribute.delete({ where: { id: z.string().uuid().parse(attrId) } });
    this.catalog.invalidate();
    await this.audit.log({ actorId: a.user.id, ip: a.ip, action: 'attribute.delete', targetType: 'attribute', targetId: attrId });
    return { ok: true };
  }
}
