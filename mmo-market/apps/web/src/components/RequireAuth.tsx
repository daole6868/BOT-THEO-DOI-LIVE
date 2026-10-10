'use client';
import { Button, Card, EmptyState, Spinner } from '@mmo/ui';
import { Lock, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export function RequireAuth({ children, verified = false }: { children: ReactNode; verified?: boolean }) {
  const { data, isLoading } = useMe();
  const path = usePathname();
  const [sent, setSent] = useState(false);
  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  if (!data?.user)
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Bạn cần đăng nhập"
          description="Đăng nhập để tiếp tục."
          action={
            <Link href={`/dang-nhap?next=${encodeURIComponent(path)}`}>
              <Button>Đăng nhập</Button>
            </Link>
          }
        />
      </Card>
    );
  if (verified && !data.user.emailVerified)
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={<MailWarning className="h-6 w-6" />}
          title="Vui lòng xác minh email"
          description={`Chúng tôi đã gửi liên kết xác minh tới ${data.user.email}.`}
          action={
            <Button
              variant="outline"
              disabled={sent}
              onClick={async () => {
                await api('/auth/resend-verification', { method: 'POST' }).catch(() => undefined);
                setSent(true);
              }}
            >
              {sent ? 'Đã gửi lại' : 'Gửi lại email xác minh'}
            </Button>
          }
        />
      </Card>
    );
  return <>{children}</>;
}
