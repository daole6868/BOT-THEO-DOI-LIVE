import { Card } from '@mmo/ui';
import type { ReactNode } from 'react';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">{footer}</div>}
      </Card>
    </div>
  );
}
