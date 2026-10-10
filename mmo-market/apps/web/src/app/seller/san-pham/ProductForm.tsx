'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Switch, Textarea, cn, useToast, vnd } from '@mmo/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ImageUpload, type UploadedImage } from '@/components/ImageUpload';
import { api, ApiError, errMsg } from '@/lib/api';
import { flattenCategories, useCategories } from '@/lib/hooks';

interface Variant {
  id?: string;
  name: string;
  price: string;
  compareAtPrice: string;
  unitsPerPurchase: string;
  minQty: string;
  maxQty: string;
  isActive: boolean;
}
interface Attr {
  key: string;
  label: string;
  type: 'SELECT' | 'MULTISELECT' | 'NUMBER' | 'BOOLEAN' | 'TEXT';
  options: { value: string; label: string }[];
  unit: string | null;
  isRequired: boolean;
}

const money = (s: string) => Number(s.replace(/\D/g, '')) || 0;
const fmt = (s: string) => (s.replace(/\D/g, '') ? Number(s.replace(/\D/g, '')).toLocaleString('vi-VN') : '');
const emptyVariant = (): Variant => ({ name: '', price: '', compareAtPrice: '', unitsPerPurchase: '1', minQty: '1', maxQty: '1000', isActive: true });

export function ProductForm({ initial }: { initial?: any }) {
  const router = useRouter();
  const toast = useToast();
  const { data: cats } = useCategories();
  const [f, setF] = useState({
    title: initial?.title ?? '',
    categoryId: initial?.categoryId ?? '',
    descriptionMd: initial?.descriptionMd ?? '',
    deliveryType: (initial?.deliveryType ?? 'AUTO') as 'AUTO' | 'MANUAL',
    warrantyHours: String(initial?.warrantyHours ?? 24),
    serviceSlaHours: String(initial?.serviceSlaHours ?? 48),
    buyerInputLabel: initial?.buyerInputLabel ?? '',
    stockFormat: initial?.stockFormat ?? '',
  });
  const [attrs, setAttrs] = useState<Record<string, any>>(initial?.attrs ?? {});
  const [variants, setVariants] = useState<Variant[]>(
    initial?.variants?.map((v: any) => ({ id: v.id, name: v.name, price: Number(v.price).toLocaleString('vi-VN'), compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice).toLocaleString('vi-VN') : '', unitsPerPurchase: String(v.unitsPerPurchase), minQty: String(v.minQty), maxQty: String(v.maxQty), isActive: v.isActive })) ?? [{ ...emptyVariant(), name: '1 sản phẩm' }],
  );
  const [images, setImages] = useState<UploadedImage[]>([]);
  const keepImages: string[] = initial?.images ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const { data: defs } = useQuery({ queryKey: ['attrs', f.categoryId], queryFn: () => api<Attr[]>(`/categories/id/${f.categoryId}/attributes`), enabled: !!f.categoryId });
  useEffect(() => {
    const cat = flattenCategories(cats).find((c) => c.id === f.categoryId);
    if (cat && !initial) setF((x) => ({ ...x, deliveryType: cat.defaultDelivery as 'AUTO' | 'MANUAL' }));
  }, [f.categoryId, cats, initial]);

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'draft');
    setErrs({});
    try {
      const cleanAttrs = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => defs?.some((d) => d.key === k) && v !== '' && v !== null && !(Array.isArray(v) && !v.length)));
      const body = {
        title: f.title,
        categoryId: f.categoryId,
        descriptionMd: f.descriptionMd,
        deliveryType: f.deliveryType,
        warrantyHours: Number(f.warrantyHours) || 0,
        serviceSlaHours: f.deliveryType === 'MANUAL' ? Number(f.serviceSlaHours) || 24 : null,
        buyerInputLabel: f.deliveryType === 'MANUAL' ? f.buyerInputLabel || null : null,
        stockFormat: f.deliveryType === 'AUTO' ? f.stockFormat || null : null,
        attrs: cleanAttrs,
        // Chỉ gửi khi có ảnh mới; không gửi = giữ nguyên ảnh cũ
        ...(images.length ? { imageUploadIds: images.map((i) => i.id) } : {}),
        variants: variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: money(v.price),
          compareAtPrice: v.compareAtPrice ? money(v.compareAtPrice) : null,
          unitsPerPurchase: Number(v.unitsPerPurchase) || 1,
          minQty: Number(v.minQty) || 1,
          maxQty: Number(v.maxQty) || 1000,
          isActive: v.isActive,
        })),
        submit,
      };
      const r = initial ? await api<any>(`/seller/products/${initial.id}`, { method: 'PATCH', body }) : await api<any>('/seller/products', { body });
      toast.success(initial ? 'Đã lưu sản phẩm' : submit ? 'Đã tạo sản phẩm' : 'Đã lưu nháp', r.status === 'PENDING_REVIEW' ? 'Sản phẩm đang chờ kiểm duyệt.' : undefined);
      router.push(`/seller/san-pham/${r.id}${!initial && f.deliveryType === 'AUTO' ? '?tab=stock' : ''}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.details?.fieldErrors) setErrs(Object.fromEntries(Object.entries(e.details.fieldErrors as Record<string, string[]>).map(([k, v]) => [k, v[0]])));
      toast.error('Không lưu được', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const setV = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Thông tin cơ bản" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên sản phẩm" error={errs.title} required className="sm:col-span-2">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} placeholder="VD: Gmail cổ 2015 – đã xác minh SĐT" />}</Field>
          <Field label="Danh mục" error={errs.categoryId} required>
            {(id) => (
              <Select id={id} value={f.categoryId} onChange={(e) => { setF({ ...f, categoryId: e.target.value }); setAttrs({}); }}>
                <option value="">Chọn danh mục</option>
                {flattenCategories(cats).map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Kiểu giao hàng" required>
            {(id) => (
              <Select id={id} value={f.deliveryType} onChange={(e) => setF({ ...f, deliveryType: e.target.value as any })} disabled={!!initial && (initial.soldCount > 0 || initial.stockTotal > 0)}>
                <option value="AUTO">⚡ Tự động (kho hàng số, giao ngay)</option>
                <option value="MANUAL">👤 Thủ công / dịch vụ</option>
              </Select>
            )}
          </Field>
          <Field label="Mô tả" error={errs.descriptionMd} hint="Markdown: **đậm**, - gạch đầu dòng. Không ghi liên hệ ngoài sàn." required className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={8} value={f.descriptionMd} onChange={(e) => setF({ ...f, descriptionMd: e.target.value })} maxLength={20000} />}
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-fg2">Ảnh sản phẩm (tối đa 8)</p>
            {initial && keepImages.length > 0 && images.length === 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {keepImages.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ))}
                <p className="w-full text-xs text-muted">Ảnh hiện tại. Tải ảnh mới sẽ thay thế toàn bộ.</p>
              </div>
            )}
            <ImageUpload purpose="product" value={images} onChange={setImages} max={8} label="Thêm ảnh" />
          </div>
        </CardBody>
      </Card>

      {defs && defs.length > 0 && (
        <Card>
          <CardHeader title="Thuộc tính lọc" subtitle="Giúp người mua tìm thấy sản phẩm qua bộ lọc danh mục" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {defs.map((d) => (
              <Field key={d.key} label={`${d.label}${d.unit ? ` (${d.unit})` : ''}`} required={d.isRequired}>
                {(id) =>
                  d.type === 'SELECT' ? (
                    <Select id={id} value={attrs[d.key] ?? ''} onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value })}>
                      <option value="">—</option>
                      {d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : d.type === 'MULTISELECT' ? (
                    <div className="flex flex-wrap gap-x-4 rounded-lg border border-border px-3 py-1.5">
                      {d.options.map((o) => (
                        <Checkbox key={o.value} label={o.label} checked={(attrs[d.key] ?? []).includes(o.value)} onChange={(c) => setAttrs({ ...attrs, [d.key]: c ? [...(attrs[d.key] ?? []), o.value] : (attrs[d.key] ?? []).filter((x: string) => x !== o.value) })} />
                      ))}
                    </div>
                  ) : d.type === 'BOOLEAN' ? (
                    <div className="pt-1"><Switch checked={!!attrs[d.key]} onChange={(v) => setAttrs({ ...attrs, [d.key]: v })} label={attrs[d.key] ? 'Có' : 'Không'} /></div>
                  ) : d.type === 'NUMBER' ? (
                    <Input id={id} inputMode="decimal" value={attrs[d.key] ?? ''} onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, '')) })} />
                  ) : (
                    <Input id={id} value={attrs[d.key] ?? ''} onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value })} maxLength={100} />
                  )
                }
              </Field>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Gói & giá" subtitle={f.deliveryType === 'AUTO' ? '“Số item mỗi lần mua” > 1 để bán theo lô (VD: Lô 10 = 10 item kho).' : 'Mỗi gói là một mức dịch vụ.'} action={<Button size="sm" variant="outline" disabled={variants.length >= 20} onClick={() => setVariants([...variants, emptyVariant()])}><Plus className="h-4 w-4" /> Thêm gói</Button>} />
        <CardBody className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className={cn('grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-12', !v.isActive && 'opacity-60')}>
              <div className="sm:col-span-4"><Input value={v.name} onChange={(e) => setV(i, { name: e.target.value })} placeholder="Tên gói (VD: 1 tài khoản)" aria-label="Tên gói" /></div>
              <div className="sm:col-span-2"><Input inputMode="numeric" value={v.price} onChange={(e) => setV(i, { price: fmt(e.target.value) })} placeholder="Giá bán ₫" aria-label="Giá" /></div>
              <div className="sm:col-span-2"><Input inputMode="numeric" value={v.compareAtPrice} onChange={(e) => setV(i, { compareAtPrice: fmt(e.target.value) })} placeholder="Giá gạch" aria-label="Giá gạch" /></div>
              {f.deliveryType === 'AUTO' && <div className="sm:col-span-1"><Input inputMode="numeric" value={v.unitsPerPurchase} onChange={(e) => setV(i, { unitsPerPurchase: e.target.value.replace(/\D/g, '') })} title="Số item kho mỗi lần mua" aria-label="Số item mỗi lần mua" /></div>}
              <div className="flex items-center gap-2 sm:col-span-3">
                <Switch checked={v.isActive} onChange={(c) => setV(i, { isActive: c })} label="Bán" />
                {variants.length > 1 && <Button size="icon" variant="ghost" className="ml-auto text-danger" onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Xoá gói"><Trash2 className="h-4 w-4" /></Button>}
              </div>
              {money(v.price) > 0 && <p className="text-xs text-muted sm:col-span-12">Người mua trả {vnd(money(v.price))}{f.deliveryType === 'AUTO' && Number(v.unitsPerPurchase) > 1 ? ` cho ${v.unitsPerPurchase} item` : ''}.</p>}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Giao hàng & bảo hành" />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Thời gian bảo hành (giờ)" hint="Tiền được giữ ít nhất bằng thời gian này">{(id) => <Input id={id} inputMode="numeric" value={f.warrantyHours} onChange={(e) => setF({ ...f, warrantyHours: e.target.value.replace(/\D/g, '') })} />}</Field>
          {f.deliveryType === 'AUTO' ? (
            <Field label="Định dạng mỗi dòng kho" hint="Hiển thị cho người mua" className="sm:col-span-2">{(id) => <Input id={id} value={f.stockFormat} onChange={(e) => setF({ ...f, stockFormat: e.target.value })} placeholder="email|password|recovery" maxLength={120} />}</Field>
          ) : (
            <>
              <Field label="Hoàn thành trong (giờ)" required>{(id) => <Input id={id} inputMode="numeric" value={f.serviceSlaHours} onChange={(e) => setF({ ...f, serviceSlaHours: e.target.value.replace(/\D/g, '') })} />}</Field>
              <Field label="Thông tin người mua cần cung cấp">{(id) => <Input id={id} value={f.buyerInputLabel} onChange={(e) => setF({ ...f, buyerInputLabel: e.target.value })} placeholder="VD: Link fanpage, màu sắc…" maxLength={200} />}</Field>
            </>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {(!initial || initial.status === 'DRAFT') && <Button variant="outline" loading={busy === 'draft'} onClick={() => save(false)}>Lưu nháp</Button>}
        <Button loading={busy === 'submit'} onClick={() => save(true)}>{initial ? 'Lưu thay đổi' : 'Đăng bán'}</Button>
      </div>
    </div>
  );
}
