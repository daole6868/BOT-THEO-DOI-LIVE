'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, LevelBadge, PageHeader, Select, Skeleton, Textarea, dateOnly, useToast } from '@mmo/ui';
import { Palmtree } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, errMsg } from '@/lib/api';

const WARRANTY = [0, 6, 12, 24, 48, 72, 168, 336, 720];

export default function SellerSettingsPage() {
  const { data: store, refetch } = useQuery({ queryKey: ['seller-store'], queryFn: () => api<any>('/seller/store') });
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ description: '', policy: '', defaultWarrantyHours: 24 });
  const [avatar, setAvatar] = useState<UploadedImage[]>([]);
  const [banner, setBanner] = useState<UploadedImage[]>([]);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    setForm({ description: store.description ?? '', policy: store.policy ?? '', defaultWarrantyHours: store.defaultWarrantyHours ?? 24 });
    setAvatar(store.avatarUrl ? [{ id: '', url: store.avatarUrl }] : []);
    setBanner(store.bannerUrl ? [{ id: '', url: store.bannerUrl }] : []);
  }, [store]);

  if (!store) return <Skeleton className="h-96" />;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      refetch();
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      toast.error('Không lưu được', errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  // id rỗng = ảnh cũ giữ nguyên; mảng rỗng = xoá ảnh.
  const imgField = (v: UploadedImage[], had: boolean) => (v.length ? (v[0].id ? v[0].id : undefined) : had ? null : undefined);

  return (
    <div className="space-y-5">
      <PageHeader title="Cài đặt gian hàng" actions={<Link href={`/shop/${store.slug}`} className="text-sm text-primary hover:underline">Xem trang shop →</Link>} />
      <Card>
        <CardHeader title={<span className="flex items-center gap-2">{store.name} <LevelBadge level={store.level} /></span>} subtitle={`Đường dẫn: /shop/${store.slug} · Tên và đường dẫn chỉ đổi được qua hỗ trợ`} />
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <div><p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh đại diện</p><ImageUpload purpose="avatar" value={avatar} onChange={setAvatar} label="Avatar" /></div>
            <div><p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh bìa (tỷ lệ 4:1)</p><ImageUpload purpose="banner" value={banner} onChange={setBanner} label="Ảnh bìa" /></div>
          </div>
          <Field label="Giới thiệu shop" hint="Hiển thị trên trang shop. Không ghi số điện thoại, Zalo, Telegram – giao dịch ngoài sàn không được bảo vệ.">
            {(id) => <Textarea id={id} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={5000} />}
          </Field>
          <Field label="Chính sách bảo hành / đổi trả">{(id) => <Textarea id={id} rows={5} value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })} maxLength={5000} />}</Field>
          <Field label="Bảo hành mặc định cho sản phẩm mới" hint="Tiền được giữ trong ký quỹ đến hết thời gian bảo hành.">
            {(id) => (
              <Select id={id} value={form.defaultWarrantyHours} onChange={(e) => setForm({ ...form, defaultWarrantyHours: Number(e.target.value) })} className="max-w-xs">
                {WARRANTY.map((h) => <option key={h} value={h}>{h === 0 ? 'Không bảo hành' : h % 24 === 0 ? `${h / 24} ngày` : `${h} giờ`}</option>)}
              </Select>
            )}
          </Field>
          <div className="flex justify-end">
            <Button
              loading={busy === 'save'}
              onClick={() =>
                run('save', () => api('/seller/store', { method: 'PATCH', body: { ...form, avatarUploadId: imgField(avatar, !!store.avatarUrl), bannerUploadId: imgField(banner, !!store.bannerUrl) } }), 'Đã lưu thông tin gian hàng')
              }
            >
              Lưu thay đổi
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Palmtree className="h-4 w-4 text-primary" /> Chế độ tạm nghỉ</span>} action={store.status === 'VACATION' ? <Badge tone="warning" dot>Đang nghỉ đến {dateOnly(store.vacationUntil)}</Badge> : store.status === 'SUSPENDED' ? <Badge tone="danger" dot>Bị tạm khoá</Badge> : <Badge tone="success" dot>Đang mở bán</Badge>} />
        <CardBody>
          {store.status === 'SUSPENDED' ? (
            <p className="text-sm text-danger">Gian hàng đang bị tạm khoá: {store.suspendReason ?? 'liên hệ hỗ trợ để biết thêm chi tiết'}.</p>
          ) : store.status === 'VACATION' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-fg2">Sản phẩm của bạn đang ẩn khỏi tìm kiếm và không nhận đơn mới.</p>
              <Button variant="outline" loading={busy === 'vac'} onClick={() => run('vac', () => api('/seller/store/vacation', { body: { until: null } }), 'Gian hàng đã mở bán trở lại')}>Mở bán lại ngay</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <p className="w-full text-sm text-fg2">Khi tạm nghỉ, sản phẩm bị ẩn và không nhận đơn mới. Đơn đang xử lý vẫn phải hoàn thành.</p>
              <Field label="Quay lại vào ngày">{(id) => <Input id={id} type="date" value={until} min={new Date(Date.now() + 86400_000).toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />}</Field>
              <Button variant="outline" disabled={!until} loading={busy === 'vac'} onClick={() => run('vac', () => api('/seller/store/vacation', { body: { until: new Date(`${until}T08:00:00+07:00`).toISOString() } }), 'Đã bật chế độ tạm nghỉ')}>Bật tạm nghỉ</Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
