import Link from 'next/link';
import { serverApi } from '@/lib/server';
import { StoreView } from './StoreView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await serverApi<{ name: string }>(`/stores/${encodeURIComponent(slug)}`);
  return { title: s?.name ?? 'Gian hàng' };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await serverApi<any>(`/stores/${encodeURIComponent(slug)}`);
  if (!store)
    return (
      <div className="container-page py-24 text-center">
        <p className="text-lg font-semibold">Gian hàng không tồn tại hoặc đang bị tạm khoá</p>
        <Link href="/" className="text-primary hover:underline">Về trang chủ</Link>
      </div>
    );
  return <StoreView initial={store} />;
}
