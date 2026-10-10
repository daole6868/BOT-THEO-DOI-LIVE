'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Textarea, useToast } from '@mmo/ui';
import { BadgeCheck, Clock, ShieldCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { MfaSetup } from '@/components/MfaSetup';
import { api, ApiError, errMsg } from '@/lib/api';
import { flattenCategories, useCategories, useMe } from '@/lib/hooks';

export default function SellerApplyPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: app, isLoading } = useQuery({ queryKey: ['my-application'], queryFn: () => api<any>('/seller-applications/me') });
  const { data: banks } = useQuery({ queryKey: ['banks'], queryFn: () => api<{ code: string; name: string }[]>('/stores/banks') });
  const { data: cats } = useCategories();
  const [mfaOpen, setMfaOpen] = useState(false);
  const [f, setF] = useState({ storeName: '', storeSlug: '', mainCategoryId: '', description: '', contact: '', fullName: '', idNumber: '', bankCode: '970422', bankAccount: '', bankHolderName: '' });
  const [front, setFront] = useState<UploadedImage[]>([]);
  const [back, setBack] = useState<UploadedImage[]>([]);
  const [selfie, setSelfie] = useState<UploadedImage[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const u = me?.user;
  if (!u) return null;

  if (u.store)
    return (
      <Card className="p-8 text-center">
        <BadgeCheck className="mx-auto h-12 w-12 text-success" />
        <p className="mt-3 text-lg font-semibold">Bạn đã có gian hàng “{u.store.name}”</p>
        <Link href="/seller"><Button className="mt-4">Vào Seller Center</Button></Link>
      </Card>
    );

  if (app && (app.status === 'PENDING' || app.status === 'APPROVED'))
    return (
      <Card className="p-8 text-center">
        <Clock className="mx-auto h-12 w-12 text-warning" />
        <p className="mt-3 text-lg font-semibold">Hồ sơ “{app.storeName}” đang chờ duyệt</p>
        <p className="mt-1 text-sm text-muted">Thường được xử lý trong 24 giờ làm việc. Bạn sẽ nhận thông báo khi có kết quả.</p>
      </Card>
    );

  const submit = async () => {
    setErrs({});
    if (!front[0] || !back[0] || !selfie[0]) return toast.error('Thiếu ảnh giấy tờ', 'Cần đủ CCCD mặt trước, mặt sau và ảnh chân dung cầm CCCD.');
    setBusy(true);
    try {
      await api('/seller-applications', {
        body: { ...f, mainCategoryId: f.mainCategoryId || undefined, storeSlug: f.storeSlug || undefined, contact: f.contact || undefined, idFrontUploadId: front[0].id, idBackUploadId: back[0].id, selfieUploadId: selfie[0].id },
      });
      toast.success('Đã gửi hồ sơ', 'Chúng tôi sẽ xét duyệt trong 24 giờ làm việc.');
      qc.invalidateQueries({ queryKey: ['my-application'] });
    } catch (e) {
      if (e instanceof ApiError && e.details?.fieldErrors) setErrs(Object.fromEntries(Object.entries(e.details.fieldErrors as Record<string, string[]>).map(([k, v]) => [k, v[0]])));
      toast.error('Không gửi được hồ sơ', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Đăng ký bán hàng" subtitle="Mở gian hàng miễn phí. Thông tin giấy tờ được mã hoá và chỉ nhân sự có thẩm quyền được xem." />
      {app?.status === 'REJECTED' || app?.status === 'NEED_INFO' ? (
        <Card className="flex items-start gap-3 border-danger/40 bg-danger-soft p-4 text-sm">
          <XCircle className="mt-0.5 h-5 w-5 text-danger" />
          <div><p className="font-semibold">{app.status === 'REJECTED' ? 'Hồ sơ trước bị từ chối' : 'Hồ sơ cần bổ sung'}</p><p className="text-fg2">{app.reviewNote}</p></div>
        </Card>
      ) : null}
      {!u.mfaEnabled ? (
        <Card className="p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <p className="mt-2 font-semibold">Bước 1: Bật xác thực 2 lớp</p>
          <p className="text-sm text-muted">Người bán bắt buộc bật 2FA để bảo vệ doanh thu và tài khoản rút tiền.</p>
          <Button className="mt-4" onClick={() => setMfaOpen(true)}>Bật 2FA ngay</Button>
          <MfaSetup open={mfaOpen} onClose={() => setMfaOpen(false)} />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Thông tin gian hàng" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên gian hàng" error={errs.storeName} required>{(id) => <Input id={id} value={f.storeName} onChange={set('storeName')} maxLength={50} />}</Field>
              <Field label="Địa chỉ gian hàng" hint="mmomarket.vn/shop/<địa-chỉ>, để trống sẽ tự tạo" error={errs.storeSlug}>{(id) => <Input id={id} value={f.storeSlug} onChange={set('storeSlug')} maxLength={40} placeholder="vd: shop-cua-toi" />}</Field>
              <Field label="Danh mục chính">
                {(id) => (
                  <Select id={id} value={f.mainCategoryId} onChange={set('mainCategoryId')}>
                    <option value="">Chọn danh mục</option>
                    {flattenCategories(cats).map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Liên hệ (không bắt buộc)" hint="Chỉ hiển thị cho admin">{(id) => <Input id={id} value={f.contact} onChange={set('contact')} maxLength={200} />}</Field>
              <Field label="Giới thiệu gian hàng" error={errs.description} required className="sm:col-span-2">{(id) => <Textarea id={id} value={f.description} onChange={set('description')} maxLength={2000} placeholder="Bạn bán gì, kinh nghiệm, cam kết bảo hành…" />}</Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Xác minh danh tính (KYC)" subtitle="Ảnh được nén lại, xoá thông tin vị trí và lưu ở kho riêng tư." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Họ tên trên CCCD" error={errs.fullName} required>{(id) => <Input id={id} value={f.fullName} onChange={set('fullName')} placeholder="NGUYEN VAN A" />}</Field>
                <Field label="Số CCCD" error={errs.idNumber} hint="Chỉ lưu dạng băm + 4 số cuối" required>{(id) => <Input id={id} inputMode="numeric" value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })} />}</Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div><p className="mb-1.5 text-[13px] font-medium text-fg2">CCCD mặt trước *</p><ImageUpload purpose="kyc" value={front} onChange={setFront} /></div>
                <div><p className="mb-1.5 text-[13px] font-medium text-fg2">CCCD mặt sau *</p><ImageUpload purpose="kyc" value={back} onChange={setBack} /></div>
                <div><p className="mb-1.5 text-[13px] font-medium text-fg2">Chân dung cầm CCCD *</p><ImageUpload purpose="kyc" value={selfie} onChange={setSelfie} /></div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tài khoản nhận tiền" subtitle="Tên chủ tài khoản phải trùng họ tên trên CCCD. Chỉ rút được về tài khoản đã xác minh." />
            <CardBody className="grid gap-4 sm:grid-cols-3">
              <Field label="Ngân hàng" required>
                {(id) => <Select id={id} value={f.bankCode} onChange={set('bankCode')}>{banks?.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</Select>}
              </Field>
              <Field label="Số tài khoản" error={errs.bankAccount} required>{(id) => <Input id={id} inputMode="numeric" value={f.bankAccount} onChange={(e) => setF({ ...f, bankAccount: e.target.value.replace(/\D/g, '') })} />}</Field>
              <Field label="Tên chủ tài khoản" error={errs.bankHolderName} required>{(id) => <Input id={id} value={f.bankHolderName} onChange={set('bankHolderName')} placeholder="NGUYEN VAN A" />}</Field>
            </CardBody>
          </Card>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Bằng việc gửi hồ sơ, bạn cam kết hàng hoá có nguồn gốc hợp pháp và tuân thủ <Link href="/hang-cam" className="text-primary hover:underline">danh mục hàng cấm</Link>.</p>
            <Badge tone="info">Duyệt trong 24h</Badge>
          </div>
          <Button size="lg" loading={busy} onClick={submit}>Gửi hồ sơ đăng ký</Button>
        </>
      )}
    </div>
  );
}
