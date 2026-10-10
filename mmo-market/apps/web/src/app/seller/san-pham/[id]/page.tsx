'use client';
import { useQuery } from '@tanstack/react-query';
import { PRODUCT_STATUS, PageHeader, Skeleton, StatusBadge, Tabs, num } from '@mmo/ui';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { StockManager } from '@/components/StockManager';
import { api } from '@/lib/api';
import { ProductForm } from '../ProductForm';

function Edit() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [tab, setTab] = useState<'info' | 'stock'>(params.get('tab') === 'stock' ? 'stock' : 'info');
  const { data, refetch } = useQuery({ queryKey: ['seller-product', id], queryFn: () => api<any>(`/seller/products/${id}`) });
  if (!data) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader
        title={data.title}
        breadcrumb={<Link href="/seller/san-pham" className="hover:text-fg">← Sản phẩm</Link>}
        subtitle={<span className="flex items-center gap-2"><StatusBadge map={PRODUCT_STATUS} value={data.status} /> {data.deliveryType === 'AUTO' && <>Tồn kho: <b>{num(data.stockTotal)}</b></>} · Đã bán {num(data.soldCount)}</span>}
        actions={data.status === 'ACTIVE' ? <Link href={`/san-pham/${id}`} target="_blank" className="text-sm text-primary hover:underline">Xem trên sàn ↗</Link> : null}
      />
      {data.moderationNote && <p className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">Ghi chú kiểm duyệt: {data.moderationNote}</p>}
      {data.deliveryType === 'AUTO' && <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: 'info', label: 'Thông tin sản phẩm' }, { value: 'stock', label: 'Kho hàng', count: data.stockTotal }]} />}
      {tab === 'info' || data.deliveryType !== 'AUTO' ? <ProductForm key={data.updatedAt} initial={data} /> : <StockManager productId={id} format={data.stockFormat} onChanged={() => refetch()} />}
    </div>
  );
}

export default function EditProductPage() {
  return (
    <Suspense>
      <Edit />
    </Suspense>
  );
}
