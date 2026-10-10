'use client';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, EmptyState, Input, POST_STATUS, PageHeader, Pagination, Select, StatusBadge, Tabs, dateTime, timeAgo, vnd } from '@mmo/ui';
import { CheckCircle2, EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { Chips } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

const WEB = process.env.NEXT_PUBLIC_WEB_URL;

function Posts() {
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [page, setPage] = useState(1);
  const [hide, setHide] = useState<any>(null);
  const { data, refetch } = useQuery({ queryKey: ['adm-posts', status, page], queryFn: () => api<any>(`/admin/community/posts?status=${status}&page=${page}`), placeholderData: keepPreviousData });
  const act = async (id: string, action: string, note?: string) => {
    if (await run(id + action, () => api(`/admin/community/posts/${id}/moderate`, { body: { action, note } }), action === 'hide' ? 'Đã ẩn bài' : 'Đã duyệt / khôi phục')) {
      setHide(null);
      refetch();
      qc.invalidateQueries({ queryKey: ['queues'] });
    }
  };
  return (
    <div>
      <div className="p-3"><Chips value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={[{ value: 'PENDING_REVIEW', label: 'Chờ duyệt' }, { value: 'OPEN', label: 'Đang mở' }, { value: 'HIDDEN', label: 'Đã ẩn' }, { value: 'FULFILLED', label: 'Đã chốt' }, { value: 'EXPIRED', label: 'Hết hạn' }]} /></div>
      {!data?.items.length ? (
        <EmptyState title="Không có bài đăng" />
      ) : (
        <ul className="divide-y divide-border">
          {data.items.map((p: any) => (
            <li key={p.id} className="flex flex-wrap gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge map={POST_STATUS} value={p.status} /> @{p.author.username} · tài khoản {timeAgo(p.author.createdAt)} · đăng {dateTime(p.createdAt)}
                </div>
                <a href={`${WEB}/yeu-cau/${p.id}`} target="_blank" rel="noreferrer" className="mt-1 block font-semibold hover:text-primary">{p.title}</a>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-fg2">{p.bodyMd}</p>
                <p className="mt-1 text-xs text-muted">Ngân sách: {p.budgetMin || p.budgetMax ? `${p.budgetMin ? vnd(p.budgetMin) : '?'} – ${p.budgetMax ? vnd(p.budgetMax) : '?'}` : 'thoả thuận'} · {p.commentCount} bình luận · {p.offerCount} báo giá</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {p.status === 'PENDING_REVIEW' && <Button size="sm" variant="success" loading={busy === p.id + 'approve'} onClick={() => act(p.id, 'approve')}><CheckCircle2 className="h-4 w-4" /> Duyệt</Button>}
                {p.status === 'HIDDEN' ? <Button size="sm" variant="outline" onClick={() => act(p.id, 'restore')}><RotateCcw className="h-4 w-4" /> Khôi phục</Button> : <Button size="sm" variant="ghost" className="text-danger" onClick={() => setHide(p)}><EyeOff className="h-4 w-4" /> Ẩn</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      <ReasonModal open={!!hide} onClose={() => setHide(null)} title="Ẩn bài đăng" danger onSubmit={(note) => act(hide.id, 'hide', note)}><p className="text-sm font-medium">{hide?.title}</p></ReasonModal>
    </div>
  );
}

function Comments() {
  const { run } = useRun();
  const [status, setStatus] = useState('HIDDEN');
  const { data, refetch } = useQuery({ queryKey: ['adm-comments', status], queryFn: () => api<any[]>(`/admin/community/comments?status=${status}`) });
  const act = (id: string, action: 'hide' | 'restore') => run(id, () => api(`/admin/community/comments/${id}/moderate`, { body: { action } }), action === 'hide' ? 'Đã ẩn bình luận' : 'Đã khôi phục').then((ok): unknown => ok && refetch());
  return (
    <div>
      <div className="p-3"><Chips value={status} onChange={setStatus} items={[{ value: 'HIDDEN', label: 'Đã ẩn (tự động / thủ công)' }, { value: 'VISIBLE', label: 'Mới nhất đang hiển thị' }]} /></div>
      {!data?.length ? (
        <EmptyState title="Không có bình luận" />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((c) => (
            <li key={c.id} className="flex gap-4 p-4">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-xs text-muted">@{c.author.username} · {dateTime(c.createdAt)} · trong <a href={`${WEB}/yeu-cau/${c.post.id}`} target="_blank" rel="noreferrer" className="text-primary">{c.post.title}</a></p>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
              {c.status === 'HIDDEN' ? <Button size="sm" variant="outline" onClick={() => act(c.id, 'restore')}><RotateCcw className="h-4 w-4" /> Khôi phục</Button> : <Button size="sm" variant="ghost" className="text-danger" onClick={() => act(c.id, 'hide')}><EyeOff className="h-4 w-4" /> Ẩn</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Keywords() {
  const { run, busy } = useRun();
  const [form, setForm] = useState({ pattern: '', action: 'REVIEW', note: '' });
  const { data, refetch } = useQuery({ queryKey: ['adm-keywords'], queryFn: () => api<any[]>('/admin/community/keywords') });
  return (
    <CardBody className="space-y-4">
      <p className="rounded-lg bg-info-soft p-2.5 text-xs text-info">Áp dụng cho bài đăng, bình luận, tin nhắn và mô tả sản phẩm. <b>Chặn</b>: từ chối nội dung ngay. <b>Duyệt</b>: cho đăng nhưng đưa vào hàng chờ kiểm duyệt. Hệ thống tự nhận diện cả biến thể viết lách (z.a.l.o, tele…).</p>
      <div className="flex flex-wrap gap-2">
        <Input value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="Từ khoá, vd: zalo" className="h-9 w-48" />
        <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="h-9 w-36"><option value="REVIEW">Đưa vào duyệt</option><option value="BLOCK">Chặn ngay</option></Select>
        <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className="h-9 w-56" />
        <Button size="sm" loading={busy === 'add'} disabled={form.pattern.trim().length < 2} onClick={() => run('add', () => api('/admin/community/keywords', { body: { ...form, note: form.note || undefined } }), 'Đã thêm từ khoá').then((ok): unknown => ok && (setForm({ pattern: '', action: 'REVIEW', note: '' }), refetch()))}>Thêm</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {data?.map((k) => (
          <span key={k.id} className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-3 pr-1 text-sm" title={k.note ?? ''}>
            <code>{k.pattern}</code>
            <Badge tone={k.action === 'BLOCK' ? 'danger' : 'warning'}>{k.action === 'BLOCK' ? 'Chặn' : 'Duyệt'}</Badge>
            <button type="button" aria-label={`Xoá ${k.pattern}`} className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => run(k.id, () => api(`/admin/community/keywords/${k.id}`, { method: 'DELETE' }), 'Đã xoá').then((ok): unknown => ok && refetch())}><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        {data && !data.length && <p className="text-sm text-muted">Chưa có từ khoá</p>}
      </div>
    </CardBody>
  );
}

export default function CommunityPage() {
  const [tab, setTab] = useState('posts');
  return (
    <div>
      <PageHeader title="Cộng đồng" subtitle="Kiểm duyệt Chợ yêu cầu: bài đăng của tài khoản mới, bình luận bị lọc tự động và danh sách từ khoá cấm." />
      <Card>
        <Tabs value={tab} onChange={setTab} className="px-3" items={[{ value: 'posts', label: 'Bài đăng' }, { value: 'comments', label: 'Bình luận' }, { value: 'keywords', label: 'Từ khoá cấm' }]} />
        {tab === 'posts' && <Posts />}
        {tab === 'comments' && <Comments />}
        {tab === 'keywords' && <Keywords />}
      </Card>
    </div>
  );
}
