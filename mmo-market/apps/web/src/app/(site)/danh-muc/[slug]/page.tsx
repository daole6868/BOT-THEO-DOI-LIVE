import { Suspense } from 'react';
import { ProductBrowser } from '@/components/ProductBrowser';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense>
      <ProductBrowser category={slug} />
    </Suspense>
  );
}
