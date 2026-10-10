'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, POST_STATUS, PageHeader, StatusBadge, timeAgo } from '@mmo/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function MyPostsPage() {
  const { data } = useQuery({ queryKey: ['my-posts'], queryFn: () => api<any>('/requests?author=me&pageSize=50') });
  return (
    <div>
      <PageHeader title="Bài yêu cầu của tôi" actions={<Link href="/yeu-cau/moi"><Button><Plus className="h-4 w-4" /> Đăng yêu cầu</Button></Link>} />
      <Card>
        {!data?.items.length ? (
          <EmptyState title="Bạn chưa đăng yêu cầu nào" description="Đăng nhu cầu để người bán gửi báo giá cho bạn." />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((p: any) => (
              <li key={p.id}>
                <Link href={`/yeu-cau/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-subtle/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-muted">{p.commentCount} bình luận · {p.offerCount} báo giá · {timeAgo(p.createdAt)}</p>
                  </div>
                  <StatusBadge map={POST_STATUS} value={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
