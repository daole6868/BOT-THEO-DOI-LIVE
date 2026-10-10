'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, Countdown, EmptyState, Field, Input, LevelBadge, Modal, POST_STATUS, Skeleton, StatusBadge, Tabs, Textarea, cn, num, shortVnd, timeAgo, useToast, vnd } from '@mmo/ui';
import { Clock, Eye, Heart, MessageCircle, Reply, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ReportButton } from '@/components/ReportButton';
import { api, errMsg, uuid } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { getSocket } from '@/lib/socket';

interface C {
  id: string;
  rootId: string;
  depth: number;
  body: string | null;
  status: string;
  likeCount: number;
  replyCount: number;
  liked: boolean;
  editedAt: string | null;
  createdAt: string;
  isPostAuthor: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null; isStaff: boolean; store: { slug: string; name: string; level: string } | null } | null;
  replyTo: { username: string; displayName: string } | null;
  replies?: C[];
}

function Composer({ postId, parent, onDone, autoFocus, placeholder }: { postId: string; parent?: C; onDone: (c: C) => void; autoFocus?: boolean; placeholder?: string }) {
  const [body, setBody] = useState(parent?.author ? `@${parent.author.username} ` : '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { data: me } = useMe();
  if (!me?.user) return <p className="text-sm text-muted"><Link href={`/dang-nhap?next=/yeu-cau/${postId}`} className="text-primary hover:underline">Đăng nhập</Link> để bình luận.</p>;
  const send = async () => {
    setBusy(true);
    try {
      const c = await api<C>(`/requests/${postId}/comments`, { body: { body, parentId: parent?.id } });
      setBody('');
      onDone(c);
    } catch (e) {
      toast.error('Không gửi được bình luận', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-start gap-2">
      <Avatar src={me.user.avatarUrl} name={me.user.displayName} size={32} />
      <div className="flex-1">
        <Textarea autoFocus={autoFocus} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder={placeholder ?? 'Viết bình luận…'} className="min-h-[60px]" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <div className="mt-1.5 flex justify-end">
          <Button size="sm" loading={busy} disabled={!body.trim()} onClick={send}><Send className="h-3.5 w-3.5" /> Gửi</Button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ c, postId, onReply, meId, onChanged }: { c: C; postId: string; onReply: (c: C) => void; meId?: string; onChanged: () => void }) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likeCount);
  const toast = useToast();
  if (c.status !== 'VISIBLE' || !c.author) return <p className="py-2 text-sm italic text-muted">Bình luận đã bị xoá hoặc ẩn.</p>;
  const toggleLike = async () => {
    if (!meId) return;
    setLiked(!liked);
    setLikes((n) => n + (liked ? -1 : 1));
    await api(`/comments/${c.id}/like`, { method: liked ? 'DELETE' : 'POST' }).catch(() => undefined);
  };
  return (
    <div id={`c-${c.id}`} className="flex gap-2.5">
      <Avatar src={c.author.avatarUrl} name={c.author.displayName} size={c.depth ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <div className="inline-block max-w-full rounded-2xl bg-subtle px-3.5 py-2">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold">
            {c.author.displayName}
            {c.isPostAuthor && <Badge tone="primary" className="px-1.5 py-0 text-[10px]">Tác giả</Badge>}
            {c.author.isStaff && <Badge tone="success" className="px-1.5 py-0 text-[10px]">Nhân viên sàn ✓</Badge>}
            {c.author.store && <LevelBadge level={c.author.store.level} />}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-fg">
            {c.replyTo && !c.body?.startsWith('@') && <span className="font-medium text-primary">@{c.replyTo.username} </span>}
            {c.body?.split(/(@[a-z0-9_.]{3,24})/gi).map((part, i) => (part.startsWith('@') ? <span key={i} className="font-medium text-primary">{part}</span> : part))}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-3 px-2 text-xs text-muted">
          <span>{timeAgo(c.createdAt)}{c.editedAt && ' · đã sửa'}</span>
          <button type="button" onClick={toggleLike} className={cn('inline-flex items-center gap-1 hover:text-danger', liked && 'font-medium text-danger')}>
            <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} /> {likes > 0 && likes}
          </button>
          {meId && <button type="button" onClick={() => onReply(c)} className="inline-flex items-center gap-1 hover:text-primary"><Reply className="h-3.5 w-3.5" /> Trả lời</button>}
          {meId === c.author.id && (
            <button type="button" onClick={async () => { if (confirm('Xoá bình luận này?')) { await api(`/comments/${c.id}`, { method: 'DELETE' }).catch((e) => toast.error('Lỗi', errMsg(e))); onChanged(); } }} className="hover:text-danger" aria-label="Xoá">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {meId && meId !== c.author.id && <ReportButton targetType="COMMENT" targetId={c.id} compact />}
        </div>
      </div>
    </div>
  );
}

function Thread({ root, postId, meId, onChanged }: { root: C; postId: string; meId?: string; onChanged: () => void }) {
  const [replies, setReplies] = useState<C[]>(root.replies ?? []);
  const [replyTo, setReplyTo] = useState<C | null>(null);
  const [cursor, setCursor] = useState<string | null>(root.replyCount > (root.replies?.length ?? 0) && root.replies?.length ? root.replies[root.replies.length - 1].createdAt : null);
  useEffect(() => {
    const s = getSocket();
    const h = (c: C) => c.rootId === root.id && c.depth === 1 && setReplies((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c]));
    s.on('comment:new', h);
    return () => {
      s.off('comment:new', h);
    };
  }, [root.id]);
  const more = async () => {
    const r = await api<{ items: C[]; nextCursor: string | null }>(`/comments/${root.id}/replies${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`);
    setReplies((xs) => [...xs, ...r.items.filter((i) => !xs.some((x) => x.id === i.id))]);
    setCursor(r.nextCursor);
  };
  return (
    <div className="py-3">
      <CommentItem c={root} postId={postId} meId={meId} onReply={setReplyTo} onChanged={onChanged} />
      {(replies.length > 0 || replyTo) && (
        <div className="ml-11 mt-2 space-y-2.5 border-l-2 border-border pl-3">
          {replies.map((r) => (
            <CommentItem key={r.id} c={r} postId={postId} meId={meId} onReply={setReplyTo} onChanged={onChanged} />
          ))}
          {cursor && <button type="button" onClick={more} className="text-xs font-medium text-primary hover:underline">Xem thêm trả lời ▾</button>}
          {replyTo && <Composer postId={postId} parent={replyTo} autoFocus placeholder={`Trả lời ${replyTo.author?.displayName}…`} onDone={(c) => { setReplies((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c])); setReplyTo(null); }} />}
        </div>
      )}
    </div>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const meId = me?.user?.id;
  const [tab, setTab] = useState<'comments' | 'offers'>(params.get('tab') === 'offers' ? 'offers' : 'comments');
  const [roots, setRoots] = useState<C[]>([]);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState({ price: '', deliveryHours: '48', message: '' });
  const [busy, setBusy] = useState(false);
  const { data: post, isLoading, refetch } = useQuery({ queryKey: ['request', id], queryFn: () => api<any>(`/requests/${id}`) });
  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => api<{ items: C[]; nextCursor: string | null }>(`/requests/${id}/comments`) });
  const offers = useQuery({ queryKey: ['offers', id], queryFn: () => api<any>(`/requests/${id}/offers`) });

  useEffect(() => {
    if (comments.data) setRoots(comments.data.items);
  }, [comments.data]);

  useEffect(() => {
    const s = getSocket();
    s.emit('room:join', { room: `post:${id}` });
    const h = (c: C) => c.depth === 0 && setRoots((xs) => (xs.some((x) => x.id === c.id) ? xs : [{ ...c, replies: [] }, ...xs]));
    s.on('comment:new', h);
    return () => {
      s.off('comment:new', h);
      s.emit('room:leave', { room: `post:${id}` });
    };
  }, [id]);

  useEffect(() => {
    if (post?.myOffer) setOffer({ price: Number(post.myOffer.price).toLocaleString('vi-VN'), deliveryHours: String(post.myOffer.deliveryHours), message: post.myOffer.message });
  }, [post?.myOffer]);

  if (isLoading) return <div className="container-page py-6"><Skeleton className="h-96" /></div>;
  if (!post) return <div className="container-page py-24"><EmptyState title="Bài đăng không tồn tại hoặc đã bị ẩn" /></div>;

  const isSeller = !!me?.user?.store;
  const canOffer = isSeller && !post.isAuthor && post.status === 'OPEN';
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      refetch();
      offers.refetch();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const message = async (peerUserId: string) => {
    if (!meId) return router.push(`/dang-nhap?next=/yeu-cau/${id}`);
    const c = await api<{ id: string }>('/chat/conversations', { body: { peerUserId, context: { type: 'post', id } } });
    router.push(`/tai-khoan/tin-nhan?c=${c.id}`);
  };

  return (
    <div className="container-page py-6">
      <Link href="/yeu-cau" className="text-xs text-muted hover:text-fg">← Chợ yêu cầu</Link>
      <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge map={POST_STATUS} value={post.status} />
              {post.category && <Link href={`/danh-muc/${post.category.slug}`} className="text-muted hover:text-primary">{post.category.name}</Link>}
            </div>
            <h1 className="mt-2 text-xl font-bold sm:text-2xl">{post.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={24} />
              <span className="font-medium text-fg2">{post.author.displayName}</span>
              <span>· {timeAgo(post.createdAt)}</span>
              <span className="inline-flex items-center gap-1">· <Eye className="h-3.5 w-3.5" /> {num(post.viewCount)}</span>
            </div>
            <div className="prose-mmo mt-4 text-sm text-fg2" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
            {post.status === 'PENDING_REVIEW' && <p className="mt-3 rounded-lg bg-warning-soft p-2.5 text-sm text-warning">Bài đang chờ kiểm duyệt, chỉ bạn nhìn thấy.</p>}
          </Card>
          <Card>
            <Tabs value={tab} onChange={setTab} className="px-3" items={[{ value: 'comments', label: 'Bình luận', count: post.commentCount }, { value: 'offers', label: 'Báo giá', count: post.offerCount }]} />
            <div className="p-4">
              {tab === 'comments' ? (
                <>
                  {post.status !== 'HIDDEN' && <Composer postId={id} onDone={(c) => setRoots((xs) => (xs.some((x) => x.id === c.id) ? xs : [{ ...c, replies: [] }, ...xs]))} />}
                  <div className="mt-2 divide-y divide-border">
                    {roots.map((r) => (
                      <Thread key={r.id} root={r} postId={id} meId={meId} onChanged={() => comments.refetch()} />
                    ))}
                  </div>
                  {!roots.length && <p className="py-6 text-center text-sm text-muted">Chưa có bình luận. Hãy là người đầu tiên!</p>}
                </>
              ) : (
                <div className="space-y-3">
                  {!offers.data?.canSeePrice && <p className="rounded-lg bg-subtle p-2.5 text-xs text-muted">Người đăng chọn ẩn giá: chỉ người đăng thấy giá chi tiết của các báo giá.</p>}
                  {!offers.data?.items.length && <p className="py-6 text-center text-sm text-muted">Chưa có báo giá.</p>}
                  {offers.data?.items.map((o: any) => (
                    <div key={o.id} className={cn('rounded-xl border p-4', o.status === 'ACCEPTED' ? 'border-success bg-success-soft/40' : 'border-border')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Avatar src={o.store.avatarUrl} name={o.store.name} size={32} />
                        <Link href={`/shop/${o.store.slug}`} className="font-semibold hover:text-primary">{o.store.name}</Link>
                        <LevelBadge level={o.store.level} />
                        <span className="text-xs text-muted">⭐ {o.store.ratingAvg.toFixed(1)} · {num(o.store.completedOrders)} đơn</span>
                        {o.status === 'ACCEPTED' && <Badge tone="success">Đã chốt</Badge>}
                        {o.mine && <Badge tone="primary">Báo giá của bạn</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm">
                        <span>Giá: <b className="text-primary">{o.price != null ? vnd(o.price) : 'Ẩn'}</b></span>
                        <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-4 w-4" /> Giao trong {o.deliveryHours} giờ</span>
                      </div>
                      {o.message && <p className="mt-2 whitespace-pre-wrap text-sm text-fg2">{o.message}</p>}
                      <div className="mt-3 flex gap-2">
                        {post.isAuthor && o.status === 'PENDING' && post.status === 'OPEN' && (
                          <Button size="sm" loading={busy} onClick={() => confirm(`Chấp nhận báo giá ${vnd(o.price)} của ${o.store.name}? Tiền sẽ được trừ vào ví và giữ trong ký quỹ.`) && run(async () => { const r = await api<{ code: string }>(`/offers/${o.id}/accept`, { method: 'POST', idem: uuid() }); qc.invalidateQueries({ queryKey: ['wallet'] }); router.push(`/tai-khoan/don-hang/${r.code}`); }, 'Đã chốt báo giá – đơn hàng đã được tạo')}>
                            Chấp nhận & thanh toán
                          </Button>
                        )}
                        {!o.mine && meId && <Button size="sm" variant="outline" onClick={() => message(o.store.ownerId)}><MessageCircle className="h-4 w-4" /> Nhắn tin</Button>}
                        {o.mine && o.status === 'PENDING' && <Button size="sm" variant="ghost" className="text-danger" onClick={() => run(() => api(`/offers/${o.id}/withdraw`, { method: 'POST' }), 'Đã rút báo giá')}>Rút báo giá</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="space-y-3 p-5 lg:sticky lg:top-20">
            <div>
              <p className="text-xs text-muted">Ngân sách</p>
              <p className="text-xl font-bold text-success">{post.budgetMin || post.budgetMax ? `${shortVnd(post.budgetMin ?? 0)} – ${shortVnd(post.budgetMax ?? 0)}` : 'Thoả thuận'}</p>
            </div>
            {post.quantity && <p className="text-sm">Số lượng: <b>{num(post.quantity)}</b></p>}
            <p className="text-sm">Hạn nhận báo giá: <b>{post.status === 'OPEN' ? <Countdown to={post.deadlineAt} /> : 'đã đóng'}</b></p>
            {canOffer && <Button className="w-full" onClick={() => setOfferOpen(true)}><Send className="h-4 w-4" /> {post.myOffer ? 'Sửa báo giá' : 'Gửi báo giá'}</Button>}
            {!isSeller && !post.isAuthor && meId && <p className="rounded-lg bg-subtle p-2.5 text-xs text-muted">Bạn cần <Link href="/tai-khoan/dang-ky-ban-hang" className="text-primary hover:underline">mở gian hàng</Link> để gửi báo giá.</p>}
            {!post.isAuthor && <Button variant="outline" className="w-full" onClick={() => message(post.author.id)}><MessageCircle className="h-4 w-4" /> Nhắn người đăng</Button>}
            {post.isAuthor && post.status === 'OPEN' && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" loading={busy} onClick={() => run(() => api(`/requests/${id}/extend`, { body: { days: 7 } }), 'Đã gia hạn thêm 7 ngày')}>Gia hạn 7 ngày</Button>
                <Button variant="ghost" size="sm" className="flex-1 text-danger" loading={busy} onClick={() => confirm('Đóng bài yêu cầu?') && run(() => api(`/requests/${id}/close`, { method: 'POST' }), 'Đã đóng bài')}>Đóng bài</Button>
              </div>
            )}
            <div className="flex justify-end"><ReportButton targetType="POST" targetId={id} /></div>
          </Card>
        </aside>
      </div>
      <Modal open={offerOpen} onClose={() => setOfferOpen(false)} title={post.myOffer ? 'Sửa báo giá' : 'Gửi báo giá'} footer={<><Button variant="ghost" onClick={() => setOfferOpen(false)}>Huỷ</Button><Button loading={busy} disabled={!offer.price || offer.message.trim().length < 10} onClick={() => run(async () => { await api(`/requests/${id}/offers`, { body: { price: Number(offer.price.replace(/\D/g, '')), deliveryHours: Number(offer.deliveryHours), message: offer.message } }); setOfferOpen(false); setTab('offers'); }, 'Đã gửi báo giá')}>Gửi</Button></>}>
        <div className="space-y-3">
          <Field label="Giá (₫)" hint="Người mua chấp nhận là tạo đơn với giá này, tiền vào ký quỹ">{(fid) => <Input id={fid} inputMode="numeric" value={offer.price} onChange={(e) => setOffer({ ...offer, price: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')).toLocaleString('vi-VN') : '' })} />}</Field>
          <Field label="Thời gian hoàn thành (giờ)">{(fid) => <Input id={fid} inputMode="numeric" value={offer.deliveryHours} onChange={(e) => setOffer({ ...offer, deliveryHours: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Mô tả báo giá" hint="Phạm vi công việc, bảo hành, cam kết">{(fid) => <Textarea id={fid} value={offer.message} onChange={(e) => setOffer({ ...offer, message: e.target.value })} maxLength={3000} />}</Field>
        </div>
      </Modal>
    </div>
  );
}

export default function RequestDetailPage() {
  return (
    <Suspense>
      <Detail />
    </Suspense>
  );
}
