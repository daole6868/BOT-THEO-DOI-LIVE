import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/server';
import { ProductView, type ProductDetail } from './ProductView';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await serverApi<ProductDetail>(`/products/${id}`);
  return p ? { title: p.title, description: `${p.title} – ${p.store.name}. Giao ${p.deliveryType === 'AUTO' ? 'tự động' : 'thủ công'}, bảo hành có ký quỹ.` } : { title: 'Sản phẩm' };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = /^[0-9a-f-]{36}$/.test(id) ? await serverApi<ProductDetail>(`/products/${id}`) : null;
  if (!p)
    return (
      <div className="container-page py-24 text-center">
        <p className="text-lg font-semibold">Sản phẩm không tồn tại hoặc đã ngừng bán</p>
        <Link href="/" className="mt-3 inline-block text-primary hover:underline">
          Về trang chủ
        </Link>
      </div>
    );
  return <ProductView p={p} />;
}
