import { Card } from '@mmo/ui';
import type { ReactNode } from 'react';

export function StaticPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      {updated && <p className="mt-1 text-xs text-muted">Cập nhật: {updated} · Văn bản mẫu – cần luật sư rà soát trước khi chạy thật.</p>}
      <Card className="prose-mmo mt-5 space-y-3 p-6 text-sm leading-relaxed text-fg2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-fg">{children}</Card>
    </div>
  );
}
