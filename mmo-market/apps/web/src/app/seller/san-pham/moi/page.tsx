import { PageHeader } from '@mmo/ui';
import Link from 'next/link';
import { ProductForm } from '../ProductForm';

export default function NewProductPage() {
  return (
    <div>
      <PageHeader title="Thêm sản phẩm" breadcrumb={<Link href="/seller/san-pham" className="hover:text-fg">← Sản phẩm</Link>} />
      <ProductForm />
    </div>
  );
}
