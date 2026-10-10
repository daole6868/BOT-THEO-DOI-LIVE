import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { unaccent } from './text';

export interface KeywordCheck {
  action: 'BLOCK' | 'REVIEW' | null;
  matched: string[];
}

/** Lọc từ khoá cấm (so khớp chuỗi con không dấu, không dùng regex của người dùng -> không ReDoS). */
@Injectable()
export class KeywordsService {
  private cache: { items: { pattern: string; norm: string; action: string }[]; exp: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async items() {
    if (this.cache && this.cache.exp > Date.now()) return this.cache.items;
    const rows = await this.prisma.bannedKeyword.findMany();
    const items = rows.map((r) => ({ pattern: r.pattern, norm: unaccent(r.pattern.toLowerCase()), action: r.action }));
    this.cache = { items, exp: Date.now() + 60_000 };
    return items;
  }

  invalidate() {
    this.cache = null;
  }

  async check(...texts: (string | null | undefined)[]): Promise<KeywordCheck> {
    const hay = unaccent(texts.filter(Boolean).join(' \n ').toLowerCase());
    const matched: string[] = [];
    let action: KeywordCheck['action'] = null;
    for (const k of await this.items()) {
      if (k.norm && hay.includes(k.norm)) {
        matched.push(k.pattern);
        if (k.action === 'BLOCK') action = 'BLOCK';
        else if (!action) action = 'REVIEW';
      }
    }
    return { action, matched };
  }
}
