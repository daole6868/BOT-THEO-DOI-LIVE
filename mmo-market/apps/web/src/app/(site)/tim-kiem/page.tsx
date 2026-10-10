import { Suspense } from 'react';
import { ProductBrowser } from '@/components/ProductBrowser';

export const metadata = { title: 'Tìm kiếm' };

export default function SearchPage() {
  return (
    <Suspense>
      <ProductBrowser />
    </Suspense>
  );
}
