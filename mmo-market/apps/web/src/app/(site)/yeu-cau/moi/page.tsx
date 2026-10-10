'use client';
import { Button, Card, Field, Input, Select, Switch, Textarea, useToast } from '@mmo/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError, errMsg } from '@/lib/api';
import { flattenCategories, useCategories } from '@/lib/hooks';

const toNum = (s: string) => (s ? Number(s.replace(/\D/g, '')) : null);
const fmt = (s: string) => (s.replace(/\D/g, '') ? Number(s.replace(/\D/g, '')).toLocaleString('vi-VN') : '');

export default function NewRequestPage() {
  const { data: cats } = useCategories();
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ title: '', categoryId: '', bodyMd: '', budgetMin: '', budgetMax: '', quantity: '', deadlineDays: '7', hidePrice: true });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErrs({});
    try {
      const r = await api<{ id: string; status: string }>('/requests', {
        body: { title: f.title, categoryId: f.categoryId, bodyMd: f.bodyMd, budgetMin: toNum(f.budgetMin), budgetMax: toNum(f.budgetMax), quantity: toNum(f.quantity), deadlineDays: Number(f.deadlineDays), offerVisibility: f.hidePrice ? 'PRIVATE' : 'PUBLIC' },
      });
      toast.success(r.status === 'OPEN' ? 'Đã đăng yêu cầu' : 'Đã gửi, bài đang chờ duyệt', r.status === 'OPEN' ? 'Người bán sẽ sớm gửi báo giá.' : 'Bài đầu tiên của tài khoản mới cần kiểm duyệt.');
      router.push(`/yeu-cau/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fieldErrors) setErrs(Object.fromEntries(Object.entries(e.details.fieldErrors as Record<string, string[]>).map(([k, v]) => [k, v[0]])));
      toast.error('Không đăng được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <RequireAuth verified>
      <div className="container-page max-w-3xl py-6">
        <h1 className="mb-1 text-2xl font-bold">Đăng yêu cầu tìm hàng</h1>
        <p className="mb-5 text-sm text-muted">Mô tả rõ nhu cầu để nhận báo giá tốt. Không ghi thông tin liên hệ ngoài sàn (Zalo, SĐT…).</p>
        <Card className="space-y-4 p-5">
          <Field label="Tiêu đề" error={errs.title} required>{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} placeholder="VD: Cần 200 tài khoản TikTok tạo trên 1 năm" />}</Field>
          <Field label="Danh mục" error={errs.categoryId} required>
            {(id) => (
              <Select id={id} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
                <option value="">Chọn danh mục</option>
                {flattenCategories(cats).map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Mô tả chi tiết" error={errs.bodyMd} hint="Hỗ trợ Markdown: **đậm**, - danh sách" required>{(id) => <Textarea id={id} rows={7} value={f.bodyMd} onChange={(e) => setF({ ...f, bodyMd: e.target.value })} maxLength={10000} placeholder={'- Số lượng, tiêu chí bắt buộc\n- Thời gian cần giao\n- Yêu cầu bảo hành'} />}</Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ngân sách từ (₫)">{(id) => <Input id={id} inputMode="numeric" value={f.budgetMin} onChange={(e) => setF({ ...f, budgetMin: fmt(e.target.value) })} />}</Field>
            <Field label="Ngân sách đến (₫)">{(id) => <Input id={id} inputMode="numeric" value={f.budgetMax} onChange={(e) => setF({ ...f, budgetMax: fmt(e.target.value) })} />}</Field>
            <Field label="Số lượng">{(id) => <Input id={id} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value.replace(/\D/g, '') })} />}</Field>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Hạn nhận báo giá">
              {(id) => (
                <Select id={id} value={f.deadlineDays} onChange={(e) => setF({ ...f, deadlineDays: e.target.value })}>
                  {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} ngày</option>)}
                </Select>
              )}
            </Field>
            <Switch checked={f.hidePrice} onChange={(v) => setF({ ...f, hidePrice: v })} label="Ẩn giá báo của người bán với người khác" />
          </div>
          <Button size="lg" className="w-full" loading={busy} disabled={!f.title || !f.categoryId || !f.bodyMd} onClick={submit}>Đăng yêu cầu</Button>
        </Card>
      </div>
    </RequireAuth>
  );
}
