import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { AttrFilter, SearchService } from './search.service';

const base = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(80).regex(/^[a-z0-9-]+$/).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  delivery: z.enum(['AUTO', 'MANUAL']).optional(),
  inStock: z.enum(['1', 'true', '0', 'false']).optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  levels: z.string().max(100).optional(),
  warrantyMin: z.coerce.number().int().min(0).max(100000).optional(),
  store: z.string().max(80).optional(),
  sort: z.enum(['relevance', 'best_selling', 'newest', 'price_asc', 'price_desc', 'rating']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

/** Bộ lọc thuộc tính trên URL: a.<key>=v1,v2 | a.<key>=10-20 | a.<key>=true */
function parseAttrs(query: Record<string, unknown>): Record<string, AttrFilter> {
  const out: Record<string, AttrFilter> = {};
  for (const [k, raw] of Object.entries(query)) {
    if (!k.startsWith('a.')) continue;
    const key = k.slice(2);
    if (!/^[a-z0-9_]{1,40}$/.test(key) || typeof raw !== 'string' || raw.length > 300) continue;
    if (raw === 'true' || raw === 'false') out[key] = { bool: raw === 'true' };
    else if (/^-?\d*(\.\d+)?~-?\d*(\.\d+)?$/.test(raw)) {
      const [a, b] = raw.split('~');
      out[key] = { min: a ? Number(a) : undefined, max: b ? Number(b) : undefined };
    } else out[key] = { values: raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30) };
  }
  if (Object.keys(out).length > 15) throw Errors.bad('Quá nhiều bộ lọc');
  return out;
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get('products')
  products(@Query() query: Record<string, unknown>) {
    const p = base.parse(query);
    return this.search.search({
      ...p,
      inStock: p.inStock === '1' || p.inStock === 'true',
      levels: p.levels ? p.levels.split(',').filter((l) => ['NEW', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND'].includes(l)) : undefined,
      attrs: parseAttrs(query),
    });
  }

  @Public()
  @Get('suggest')
  suggest(@Query('q') q = '') {
    return this.search.suggest(String(q).slice(0, 100));
  }
}
