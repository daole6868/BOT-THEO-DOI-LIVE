'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, EmptyState, LevelBadge, Spinner, cn, timeAgo, useToast, vnd } from '@mmo/ui';
import { AlertTriangle, ArrowLeft, Ban, CheckCheck, Headset, ImagePlus, MessageCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, errMsg, uploadImage, uuid } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { getSocket } from '@/lib/socket';
import { ReportButton } from './ReportButton';

interface Msg {
  id: string;
  conversationId: string;
  senderId: string;
  clientMsgId: string;
  kind: string;
  body: string | null;
  payload: any;
  flags: string[];
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
}

function MessageBubble({ m, mine, peerName }: { m: Msg; mine: boolean; peerName?: string }) {
  if (m.kind === 'SYSTEM') return <p className="my-2 text-center text-xs text-muted">{m.body}</p>;
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[78%]', mine && 'items-end')}>
        <div className={cn('rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-md bg-primary text-primary-fg' : 'rounded-bl-md bg-subtle text-fg', m.failed && 'opacity-60')}>
          {m.kind === 'TEXT' && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
          {m.kind === 'IMAGE' && m.payload?.url && (
            <a href={m.payload.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.payload.url} alt="Ảnh" className="max-h-64 rounded-lg" />
            </a>
          )}
          {m.kind === 'PRODUCT_CARD' && (
            <Link href={`/san-pham/${m.payload.productId}`} className="block min-w-[200px]">
              <p className="text-[11px] opacity-80">Sản phẩm</p>
              <p className="font-medium underline">{m.payload.title}</p>
              <p className="text-xs">từ {vnd(m.payload.priceMin)}</p>
            </Link>
          )}
          {m.kind === 'ORDER_CARD' && (
            <div className="min-w-[200px]">
              <p className="text-[11px] opacity-80">Đơn hàng {m.payload.orderCode}</p>
              <p className="font-medium">{m.payload.title}</p>
              <p className="text-xs">{vnd(m.payload.total)}</p>
            </div>
          )}
        </div>
        {m.flags?.includes('off_platform') && (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-warning">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Tin nhắn có thông tin liên hệ ngoài sàn. Giao dịch ngoài sàn KHÔNG được bảo vệ{!mine && peerName ? ` – hãy cẩn trọng với ${peerName}` : ''}.
          </p>
        )}
        <p className={cn('mt-0.5 text-[10px] text-muted', mine && 'text-right')}>{m.failed ? 'Gửi lỗi' : m.pending ? 'Đang gửi…' : timeAgo(m.createdAt)}</p>
      </div>
    </div>
  );
}

function Conversation({ id, meId, onBack }: { id: string; meId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['conversation', id], queryFn: () => api<any>(`/chat/conversations/${id}/messages`) });

  useEffect(() => {
    if (data) {
      setMsgs(data.items);
      setHasMore(data.hasMore);
      const peer = data.conversation.members.find((m: any) => m.id !== meId);
      setReadAt(peer?.lastReadAt ?? null);
      api(`/chat/conversations/${id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['chat-unread'] })).catch(() => undefined);
    }
  }, [data, id, meId, qc]);

  useLayoutEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length]);

  useEffect(() => {
    const s = getSocket();
    const onNew = (e: { conversationId: string; message: Msg }) => {
      if (e.conversationId !== id) return;
      setMsgs((xs) => (xs.some((x) => x.id === e.message.id || x.clientMsgId === e.message.clientMsgId) ? xs.map((x) => (x.clientMsgId === e.message.clientMsgId ? e.message : x)) : [...xs, e.message]));
      if (e.message.senderId !== meId) s.emit('message:read', { conversationId: id });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    const onRead = (e: { conversationId: string; userId: string; at: string }) => e.conversationId === id && e.userId !== meId && setReadAt(e.at);
    const onTyping = (e: { conversationId: string; userId: string; isTyping: boolean }) => e.conversationId === id && e.userId !== meId && setTyping(e.isTyping);
    s.on('message:new', onNew);
    s.on('message:read', onRead);
    s.on('typing', onTyping);
    return () => {
      s.off('message:new', onNew);
      s.off('message:read', onRead);
      s.off('typing', onTyping);
    };
  }, [id, meId, qc]);

  const sendPayload = async (payload: Record<string, unknown>, optimistic: Msg) => {
    setMsgs((xs) => [...xs, optimistic]);
    const s = getSocket();
    const viaRest = () => api<Msg>(`/chat/conversations/${id}/messages`, { body: payload });
    try {
      const msg: Msg = s.connected
        ? await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), 8000);
            s.emit('message:send', { ...payload, conversationId: id }, (ack: any) => {
              clearTimeout(t);
              if (ack?.ok) resolve(ack.message);
              else reject(Object.assign(new Error(ack?.error?.message ?? 'Lỗi'), { ack }));
            });
          })
        : await viaRest();
      setMsgs((xs) => xs.map((x) => (x.clientMsgId === optimistic.clientMsgId ? msg : x)));
    } catch (e: any) {
      if (e?.message === 'timeout') {
        try {
          const msg = await viaRest();
          setMsgs((xs) => xs.map((x) => (x.clientMsgId === optimistic.clientMsgId ? msg : x)));
          return;
        } catch {
          /* rơi xuống báo lỗi */
        }
      }
      setMsgs((xs) => xs.map((x) => (x.clientMsgId === optimistic.clientMsgId ? { ...x, pending: false, failed: true } : x)));
      toast.error('Không gửi được tin nhắn', e?.ack?.error?.message ?? errMsg(e));
    }
  };

  const sendText = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const clientMsgId = uuid();
    sendPayload({ clientMsgId, kind: 'TEXT', body }, { id: clientMsgId, conversationId: id, senderId: meId, clientMsgId, kind: 'TEXT', body, payload: null, flags: [], createdAt: new Date().toISOString(), pending: true });
  };

  const sendImage = async (f?: File) => {
    if (!f) return;
    try {
      const up = await uploadImage(f, 'chat');
      const clientMsgId = uuid();
      sendPayload({ clientMsgId, kind: 'IMAGE', uploadId: up.id }, { id: clientMsgId, conversationId: id, senderId: meId, clientMsgId, kind: 'IMAGE', body: null, payload: { url: up.url }, flags: [], createdAt: new Date().toISOString(), pending: true });
    } catch (e) {
      toast.error('Tải ảnh thất bại', errMsg(e));
    }
  };

  const loadMore = async () => {
    if (!msgs.length) return;
    setLoadingMore(true);
    try {
      const r = await api<any>(`/chat/conversations/${id}/messages?before=${encodeURIComponent(msgs[0].createdAt)}`);
      setMsgs((xs) => [...r.items, ...xs]);
      setHasMore(r.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const onType = (v: string) => {
    setText(v);
    const s = getSocket();
    s.emit('typing', { conversationId: id, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => s.emit('typing', { conversationId: id, isTyping: false }), 2500);
  };

  if (isLoading || !data)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  const conv = data.conversation;
  const peers = conv.members.filter((m: any) => m.id !== meId);
  const peer = peers[0];
  const lastMine = [...msgs].reverse().find((m) => m.senderId === meId && !m.pending);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg p-1 text-muted hover:bg-subtle md:hidden" aria-label="Quay lại">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {conv.type === 'SUPPORT' ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary"><Headset className="h-5 w-5" /></span>
        ) : (
          <Avatar src={peer?.avatarUrl} name={peer?.displayName} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conv.type === 'SUPPORT' ? `Hỗ trợ · ${conv.supportTopic ?? ''}` : peer?.displayName}</p>
          <p className="truncate text-xs text-muted">{typing ? 'đang soạn tin…' : conv.type === 'SUPPORT' ? (conv.supportStatus === 'QUEUED' ? 'Đang chờ hỗ trợ viên…' : conv.supportStatus === 'RESOLVED' ? 'Đã giải quyết' : `Đang hỗ trợ: ${peers.filter((p: any) => p.isStaff).map((p: any) => p.displayName).join(', ')}`) : `@${peer?.username}`}</p>
        </div>
        {conv.type === 'DIRECT' && peer && (
          <div className="flex items-center gap-2">
            <ReportButton targetType="USER" targetId={peer.id} compact />
            <button
              type="button"
              title="Chặn người này"
              className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-danger"
              onClick={async () => {
                if (!confirm(`Chặn ${peer.displayName}? Hai bên sẽ không nhắn tin được cho nhau.`)) return;
                await api(`/users/${peer.id}/block`, { method: 'POST' }).then(() => toast.success('Đã chặn')).catch((e) => toast.error('Lỗi', errMsg(e)));
              }}
            >
              <Ban className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {conv.contextTitle && (
        <div className="border-b border-border bg-subtle/60 px-4 py-2 text-xs text-fg2">
          Đang trao đổi về:{' '}
          {conv.contextType === 'product' ? (
            <Link href={`/san-pham/${conv.contextId}`} className="font-medium text-primary hover:underline">{conv.contextTitle}</Link>
          ) : conv.contextType === 'order' ? (
            <span className="font-medium">{conv.contextTitle}</span>
          ) : conv.contextType === 'post' ? (
            <Link href={`/yeu-cau/${conv.contextId}`} className="font-medium text-primary hover:underline">{conv.contextTitle}</Link>
          ) : (
            <span className="font-medium">{conv.contextTitle}</span>
          )}
        </div>
      )}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {hasMore && (
          <div className="text-center">
            <Button size="sm" variant="ghost" loading={loadingMore} onClick={loadMore}>Tải tin cũ hơn</Button>
          </div>
        )}
        {msgs.map((m) => (
          <MessageBubble key={m.clientMsgId ?? m.id} m={m} mine={m.senderId === meId} peerName={peer?.displayName} />
        ))}
        {lastMine && readAt && new Date(readAt) >= new Date(lastMine.createdAt) && (
          <p className="flex items-center justify-end gap-1 text-[11px] text-muted"><CheckCheck className="h-3.5 w-3.5 text-primary" /> Đã xem</p>
        )}
        <div ref={bottom} />
      </div>
      <div className="border-t border-border p-3">
        <p className="mb-2 text-[11px] text-muted">🔒 Chỉ giao dịch qua sàn để được bảo vệ bởi ký quỹ. Không gửi mật khẩu/mã 2FA qua chat.</p>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
        >
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg p-2.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Gửi ảnh">
            <ImagePlus className="h-5 w-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => sendImage(e.target.files?.[0])} />
          <textarea
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Nhập tin nhắn… (Enter để gửi)"
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="icon" className="h-[42px] w-[42px]" disabled={!text.trim()} aria-label="Gửi">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function ChatView() {
  const { data: me } = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const active = params.get('c');
  const [filter, setFilter] = useState<'' | 'DIRECT' | 'SUPPORT'>('');
  const { data: list, isLoading } = useQuery({ queryKey: ['conversations', filter], queryFn: () => api<any[]>(`/chat/conversations${filter ? `?type=${filter}` : ''}`), refetchInterval: 30_000 });
  const meId = me?.user?.id;
  if (!meId) return null;
  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn('w-full shrink-0 flex-col border-r border-border md:flex md:w-80', active ? 'hidden' : 'flex')}>
        <div className="flex gap-1 border-b border-border p-2">
          {[['', 'Tất cả'], ['DIRECT', 'Người bán / mua'], ['SUPPORT', 'Hỗ trợ']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFilter(v as any)} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', filter === v ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-subtle')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center"><Spinner /></div>
          ) : !list?.length ? (
            <EmptyState icon={<MessageCircle className="h-6 w-6" />} title="Chưa có cuộc trò chuyện" description="Nhắn tin với người bán từ trang sản phẩm hoặc gian hàng." />
          ) : (
            list.map((c) => {
              const peer = c.peers.find((p: any) => !p.isStaff) ?? c.peers[0];
              return (
                <button key={c.id} type="button" onClick={() => router.push(`/tai-khoan/tin-nhan?c=${c.id}`)} className={cn('flex w-full gap-3 border-b border-border px-3 py-3 text-left hover:bg-subtle', active === c.id && 'bg-primary-soft/60')}>
                  <div className="relative">
                    {c.type === 'SUPPORT' ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary"><Headset className="h-5 w-5" /></span>
                    ) : (
                      <Avatar src={peer?.avatarUrl} name={peer?.displayName} size={40} />
                    )}
                    {peer?.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{c.type === 'SUPPORT' ? `Hỗ trợ · ${c.supportTopic ?? ''}` : peer?.displayName}</span>
                        {peer?.store && <LevelBadge level={peer.store.level} />}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted">{c.lastMessagePreview ?? '…'}</span>
                      {c.unread > 0 && <Badge tone="primary" className="px-1.5 py-0 text-[10px]">{c.unread}</Badge>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      {active ? (
        <Conversation key={active} id={active} meId={meId} onBack={() => router.push('/tai-khoan/tin-nhan')} />
      ) : (
        <div className="hidden flex-1 items-center justify-center md:flex">
          <EmptyState icon={<MessageCircle className="h-6 w-6" />} title="Chọn một cuộc trò chuyện" description="Tin nhắn được lưu trên sàn để làm bằng chứng khi cần khiếu nại." />
        </div>
      )}
    </div>
  );
}
