'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, PageHeader, cn, dateTime } from '@mmo/ui';
import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useInfiniteQuery({
    queryKey: ['notifications-all'],
    queryFn: ({ pageParam }) => api<any>(`/notifications${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader
        title="Thông báo"
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              await api('/notifications/read', { body: { all: true } });
              qc.invalidateQueries({ queryKey: ['notifications-all'] });
              qc.invalidateQueries({ queryKey: ['me'] });
            }}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        }
      />
      <Card>
        {!items.length ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="Chưa có thông báo" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n: any) => (
              <li key={n.id}>
                <button type="button" onClick={() => n.link && router.push(n.link)} className={cn('flex w-full gap-3 p-4 text-left hover:bg-subtle/60', !n.readAt && 'bg-primary-soft/40')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-border' : 'bg-primary')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.title}</span>
                    {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                    <span className="text-xs text-muted">{dateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <div className="p-3 text-center">
            <Button variant="ghost" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Xem thêm</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
