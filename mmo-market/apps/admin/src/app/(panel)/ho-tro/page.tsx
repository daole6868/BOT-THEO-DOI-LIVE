'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, StatusBadge, Textarea, cn, dateTime, timeAgo } from '@mmo/ui';
import { CheckCheck, Headset, Send, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Chips } from '@/components/Toolbar';
import { api, uuid } from '@/lib/api';
import { useStaff } from '@/lib/hooks';
import { SUPPORT_STATUS } from '@/lib/labels';
import { getSocket } from '@/lib/socket';
import { useRun } from '@/lib/useRun';

const waitLabel = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)} phút` : `${Math.floor(sec / 3600)} giờ`);

export default function SupportInbox() {
  const { data: me } = useStaff();
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const { data: queue } = useQuery({ queryKey: ['support-queue', status], queryFn: () => api<any[]>(`/admin/support/queue${status ? `?status=${status}` : ''}`), refetchInterval: 20_000 });
  const { data: convo } = useQuery({ queryKey: ['support-msgs', active], queryFn: () => api<any>(`/admin/support/conversations/${active}/messages`), enabled: !!active });

  // Tin nhắn mới của khách (kể cả khi mình chưa nhận cuộc trò chuyện)
  useEffect(() => {
    const s = getSocket();
    const h = (p: any) => p?.conversationId === active && qc.invalidateQueries({ queryKey: ['support-msgs', active] });
    s.on('support:message', h);
    return () => {
      s.off('support:message', h);
    };
  }, [active, qc]);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [convo?.items?.length]);

  const current = queue?.find((c) => c.id === active);
  const isMember = !!convo?.conversation.members.some((m: any) => m.id === me?.user?.id);
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const ok = await run('send', () => api(`/admin/support/conversations/${active}/messages`, { body: { clientMsgId: uuid(), body } }));
    if (!ok) setText(body);
    qc.invalidateQueries({ queryKey: ['support-msgs', active] });
    qc.invalidateQueries({ queryKey: ['support-queue'] });
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['support-msgs', active] });
    qc.invalidateQueries({ queryKey: ['support-queue'] });
    qc.invalidateQueries({ queryKey: ['queues'] });
  };
  const customer = convo?.conversation.members.find((m: any) => !m.isStaff);

  return (
    <div className="grid h-[calc(100vh-8.5rem)] gap-4 lg:grid-cols-[340px_1fr]">
      <Card className={cn('flex min-h-0 flex-col', active && 'hidden lg:flex')}>
        <div className="space-y-2 border-b border-border p-3">
          <p className="flex items-center gap-2 font-semibold"><Headset className="h-4 w-4 text-primary" /> Hỗ trợ trực tuyến</p>
          <Chips value={status} onChange={setStatus} items={[{ value: '', label: 'Đang mở' }, { value: 'QUEUED', label: 'Chờ nhận' }, { value: 'ASSIGNED', label: 'Đang hỗ trợ' }, { value: 'RESOLVED', label: 'Đã xong' }]} />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {!queue?.length && <EmptyState title="Không có yêu cầu" description="Khách gửi yêu cầu qua nút Hỗ trợ trên web sẽ hiện ở đây ngay lập tức." />}
          {queue?.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setActive(c.id)} className={cn('flex w-full gap-3 p-3 text-left hover:bg-subtle', active === c.id && 'bg-primary-soft')}>
                <Avatar src={c.customer?.avatarUrl} name={c.customer?.displayName} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{c.customer?.displayName ?? 'Khách'}</p>
                    <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-fg2">{c.lastMessagePreview}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge map={SUPPORT_STATUS} value={c.status} />
                    {c.topic && <Badge>{c.topic}</Badge>}
                    {c.waitingSec != null && <span className={cn('text-[11px] font-medium', c.waitingSec > 300 ? 'text-danger' : 'text-warning')}>chờ {waitLabel(c.waitingSec)}</span>}
                    {c.staff && <span className="text-[11px] text-muted">· {c.staff.displayName}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className={cn('flex min-h-0 flex-col', !active && 'hidden lg:flex')}>
        {!active || !convo ? (
          <EmptyState icon={<Headset className="h-6 w-6" />} title="Chọn một cuộc trò chuyện" description="Bấm vào yêu cầu bên trái để xem và trả lời." className="my-auto" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
              <button type="button" className="text-sm text-muted lg:hidden" onClick={() => setActive(null)}>←</button>
              <Avatar src={customer?.avatarUrl} name={customer?.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{customer?.displayName} {customer && <Link href={`/nguoi-dung/${customer.id}`} className="text-xs font-normal text-primary">@{customer.username} · hồ sơ 360°</Link>}</p>
                <p className="text-xs text-muted">{convo.conversation.supportTopic ?? 'Hỗ trợ'}{convo.conversation.contextTitle && ` · ${convo.conversation.contextTitle}`}</p>
              </div>
              {!isMember && convo.conversation.supportStatus !== 'RESOLVED' && <Button size="sm" loading={busy === 'claim'} onClick={() => run('claim', () => api(`/admin/support/conversations/${active}/claim`, { method: 'POST' }), 'Đã nhận hỗ trợ').then(refresh)}><UserPlus className="h-4 w-4" /> Nhận hỗ trợ</Button>}
              {convo.conversation.supportStatus !== 'RESOLVED' && <Button size="sm" variant="outline" loading={busy === 'resolve'} onClick={() => run('resolve', () => api(`/admin/support/conversations/${active}/resolve`, { method: 'POST' }), 'Đã đánh dấu hoàn tất').then(refresh)}><CheckCheck className="h-4 w-4" /> Hoàn tất</Button>}
              {current?.contextId && convo.conversation.contextType === 'order' && <Link href={`/don-hang/${current.contextId}`} className="text-xs text-primary">Mở đơn {current.contextId} →</Link>}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-subtle/40 p-4">
              {convo.items.map((m: any) => {
                const sender = convo.conversation.members.find((x: any) => x.id === m.senderId);
                const mine = m.senderId === me?.user?.id;
                if (m.kind === 'SYSTEM') return <p key={m.id} className="text-center text-xs text-muted">{m.body}</p>;
                return (
                  <div key={m.id} className={cn('flex', mine || sender?.isStaff ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'bg-primary text-primary-fg' : sender?.isStaff ? 'bg-info-soft' : 'bg-card shadow-sm')}>
                      {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{sender?.displayName}</p>}
                      {m.kind === 'IMAGE' && m.payload?.url ? (
                        <a href={m.payload.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.payload.url} alt="Ảnh" className="max-h-60 rounded-lg" />
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      )}
                      <p className={cn('mt-0.5 text-[10px]', mine ? 'text-primary-fg/70' : 'text-muted')}>{dateTime(m.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>
            <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <Textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={isMember ? 'Nhập trả lời… (Enter để gửi, Shift+Enter xuống dòng)' : 'Gửi tin sẽ tự động nhận cuộc trò chuyện này'}
                maxLength={4000}
              />
              <Button type="submit" loading={busy === 'send'} disabled={!text.trim()} aria-label="Gửi"><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
