'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Dropdown, EmptyState, Input, MenuItem, PRODUCT_STATUS, PageHeader, Pagination, StatusBadge, TD, TH, Table, Tabs, num, shortVnd, useToast } from '@mmo/ui';
import { Copy, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DeliveryTag } from '@/components/ProductCard';
import { api, errMsg } from '@/lib/api';

export default function SellerProducts() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const router = useRouter();
  const toast = useToast();
  const { data, refetch } = useQuery({ queryKey: ['seller-products', status, q, page], queryFn: () => api<any>(`/seller/products?page=${page}${status ? `&status=${status}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`) });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refetch();
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
    }
  };
  return (
    <div>
      <PageHeader title="Sản phẩm" subtitle="Seller cấp Bạc trở lên được tự duyệt; cấp thấp hơn chờ kiểm duyệt trước khi hiển thị." actions={<Link href="/seller/san-pham/moi"><Button><Plus className="h-4 w-4" /> Thêm sản phẩm</Button></Link>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="border-0" items={[{ value: '', label: 'Tất cả' }, { value: 'ACTIVE', label: 'Đang bán' }, { value: 'PENDING_REVIEW', label: 'Chờ duyệt' }, { value: 'HIDDEN', label: 'Đang ẩn' }, { value: 'DRAFT', label: 'Nháp' }, { value: 'REJECTED', label: 'Bị từ chối' }]} />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tìm sản phẩm…" className="my-2 ml-auto h-9 w-56" />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Chưa có sản phẩm" action={<Link href="/seller/san-pham/moi"><Button>Tạo sản phẩm đầu tiên</Button></Link>} />
        ) : (
          <Table>
            <thead><tr><TH>Sản phẩm</TH><TH>Trạng thái</TH><TH align="right">Giá từ</TH><TH align="right">Tồn</TH><TH align="right">Đã bán</TH><TH align="right">Lượt xem</TH><TH /></tr></thead>
            <tbody>
              {data.items.map((p: any) => (
                <tr key={p.id} className="hover:bg-subtle/50">
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-12 shrink-0 overflow-hidden rounded-md bg-subtle">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.images[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/seller/san-pham/${p.id}`} className="line-clamp-1 font-medium hover:text-primary">{p.title}</Link>
                        <div className="flex items-center gap-2 text-xs text-muted"><DeliveryTag type={p.deliveryType} /> {p.category.name}</div>
                        {p.moderationNote && <p className="text-xs text-danger">Ghi chú kiểm duyệt: {p.moderationNote}</p>}
                      </div>
                    </div>
                  </TD>
                  <TD><StatusBadge map={PRODUCT_STATUS} value={p.status} /></TD>
                  <TD align="right">{shortVnd(p.priceMin)}</TD>
                  <TD align="right" className={p.deliveryType === 'AUTO' && p.stockTotal < 20 ? 'font-semibold text-warning' : ''}>{p.deliveryType === 'AUTO' ? num(p.stockTotal) : '—'}</TD>
                  <TD align="right">{num(p.soldCount)}</TD>
                  <TD align="right">{num(p.viewCount)}</TD>
                  <TD align="right">
                    <Dropdown trigger={() => <button type="button" className="rounded-md p-1.5 hover:bg-subtle" aria-label="Thao tác"><MoreHorizontal className="h-4 w-4" /></button>}>
                      {(close) => (
                        <div onClick={close}>
                          <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => router.push(`/seller/san-pham/${p.id}`)}>Sửa / nhập kho</MenuItem>
                          {p.status === 'ACTIVE' && <MenuItem icon={<Eye className="h-4 w-4" />} onClick={() => window.open(`/san-pham/${p.id}`, '_blank')}>Xem trên sàn</MenuItem>}
                          {['ACTIVE', 'PENDING_REVIEW'].includes(p.status) && <MenuItem icon={<EyeOff className="h-4 w-4" />} onClick={() => act(() => api(`/seller/products/${p.id}/visibility`, { body: { action: 'hide' } }), 'Đã ẩn sản phẩm')}>Ẩn</MenuItem>}
                          {p.status === 'HIDDEN' && <MenuItem icon={<Eye className="h-4 w-4" />} onClick={() => act(() => api(`/seller/products/${p.id}/visibility`, { body: { action: 'show' } }), 'Đã hiện sản phẩm')}>Hiện lại</MenuItem>}
                          <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => act(() => api(`/seller/products/${p.id}/duplicate`, { method: 'POST' }), 'Đã tạo bản sao (nháp)')}>Nhân bản</MenuItem>
                          <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => confirm('Xoá sản phẩm? Kho chưa bán sẽ bị thu hồi.') && act(() => api(`/seller/products/${p.id}`, { method: 'DELETE' }), 'Đã xoá sản phẩm')}>Xoá</MenuItem>
                        </div>
                      )}
                    </Dropdown>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
