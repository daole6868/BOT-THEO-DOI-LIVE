'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Pagination, StatusBadge, cn, dateTime } from '@mmo/ui';
import { EyeOff, Lock, MessagesSquare, X } from 'lucide-react';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { Chips } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { REPORT_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

const TARGET: Record<string, string> = { PRODUCT: 'Sản phẩm', POST: 'Bài đăng', COMMENT: 'Bình luận', MESSAGE: 'Tin nhắn', USER: 'Người dùng', STORE: 'Gian hàng', REVIEW: 'Đánh giá' };
const ACTION: Record<string, string> = { DISMISS: 'Bỏ qua báo cáo', HIDE: 'Ẩn nội dung', LOCK_USER: 'Khoá tài khoản vi phạm' };

export default function ReportsPage() {
  const qc = useQueryClient();
  const { run } = useRun();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<{ r: any; action: 'DISMISS' | 'HIDE' | 'LOCK_USER' } | null>(null);
  const [inspect, setInspect] = useState<any>(null);
  const [convo, setConvo] = useState<any>(null);
  const { data, refetch } = useQuery({ queryKey: ['adm-reports', status, page], queryFn: () => api<any>(`/admin/reports?status=${status}&page=${page}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader title="Báo cáo vi phạm" subtitle="Người dùng báo cáo sản phẩm, bài đăng, tin nhắn… Nhiều báo cáo cùng một nội dung được đánh dấu ưu tiên." />
      <Card>
        <div className="border-b border-border p-3"><Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={Object.entries(REPORT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} /></div>
        {!data?.items.length ? (
          <EmptyState title="Không có báo cáo" />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((r: any) => (
              <li key={r.id} className="flex flex-wrap gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{r.reasonLabel}</Badge>
                    <Badge>{TARGET[r.targetType] ?? r.targetType}</Badge>
                    {r.sameTargetCount > 1 && <Badge tone="warning">{r.sameTargetCount} báo cáo cùng nội dung</Badge>}
                    <StatusBadge map={REPORT_STATUS} value={r.status} />
                  </div>
                  <div className="mt-2 rounded-lg bg-subtle p-3 text-sm">
                    {r.target ? (
                      <>
                        {r.target.link ? <a href={`${process.env.NEXT_PUBLIC_WEB_URL}${r.target.link}`} target="_blank" rel="noreferrer" className="font-medium hover:text-primary">{r.target.title}</a> : <p className="font-medium">{r.target.title}</p>}
                        {r.target.sub && <p className="text-xs text-muted">{r.target.sub}{r.target.status && ` · ${r.target.status}`}</p>}
                        {r.target.body && <p className="mt-1 whitespace-pre-wrap text-fg2">{r.target.body}</p>}
                      </>
                    ) : (
                      <p className="text-muted">Nội dung đã bị xoá</p>
                    )}
                  </div>
                  {r.detail && <p className="mt-2 text-sm"><span className="text-muted">Người báo cáo ghi:</span> {r.detail}</p>}
                  <p className="mt-1 text-xs text-muted">bởi @{r.reporter?.username} · {dateTime(r.createdAt)}{r.action && ` · đã xử lý: ${ACTION[r.action] ?? r.action}`}{r.handleNote && ` — ${r.handleNote}`}</p>
                </div>
                {r.status === 'OPEN' && (
                  <div className="flex shrink-0 flex-col gap-2">
                    {r.targetType !== 'USER' && r.targetType !== 'STORE' && <Button size="sm" variant="outline" onClick={() => setPending({ r, action: 'HIDE' })}><EyeOff className="h-4 w-4" /> Ẩn nội dung</Button>}
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPending({ r, action: 'LOCK_USER' })}><Lock className="h-4 w-4" /> Khoá người vi phạm</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending({ r, action: 'DISMISS' })}><X className="h-4 w-4" /> Bỏ qua</Button>
                    {r.targetType === 'MESSAGE' && r.target?.conversationId && <Button size="sm" variant="ghost" onClick={() => setInspect(r)}><MessagesSquare className="h-4 w-4" /> Xem hội thoại</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      <ReasonModal
        open={!!inspect}
        onClose={() => setInspect(null)}
        title="Xem hội thoại riêng tư"
        onSubmit={async (reason) => {
          await run('i', async () => setConvo({ ...(await api<any>(`/admin/support/conversations/${inspect.target.conversationId}/inspect`, { body: { reason } })), flagged: inspect.targetId, senderId: inspect.target.senderId }));
          setInspect(null);
        }}
      >
        <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">Tin nhắn giữa người dùng là riêng tư. Chỉ xem khi cần xác minh báo cáo – lý do và IP của bạn được ghi nhật ký.</p>
      </ReasonModal>
      <Modal open={!!convo} onClose={() => setConvo(null)} title="Hội thoại được báo cáo" size="lg">
        {convo && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {convo.items.map((m: any) => {
              const who = convo.conversation.members.find((x: any) => x.id === m.senderId);
              return (
                <div key={m.id} className={cn('rounded-lg p-2.5 text-sm', m.id === convo.flagged ? 'bg-danger-soft ring-1 ring-danger' : 'bg-subtle')}>
                  <p className="text-xs text-muted">{who ? `${who.displayName} (@${who.username})` : 'Hệ thống'} · {dateTime(m.createdAt)}{m.flags?.length ? ` · ${m.flags.join(', ')}` : ''}</p>
                  <p className="whitespace-pre-wrap">{m.body ?? (m.kind === 'IMAGE' ? '[ảnh]' : m.kind)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
      <ReasonModal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? ACTION[pending.action] : ''}
        optional={pending?.action === 'DISMISS'}
        danger={pending?.action === 'LOCK_USER'}
        label="Ghi chú xử lý"
        onSubmit={async (note) => {
          if (await run('h', () => api(`/admin/reports/${pending!.r.id}/handle`, { body: { action: pending!.action, note: note || undefined } }), 'Đã xử lý báo cáo')) {
            setPending(null);
            refetch();
            qc.invalidateQueries({ queryKey: ['queues'] });
          }
        }}
      />
    </div>
  );
}
