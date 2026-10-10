'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, PageHeader, TD, TH, Table, cn, num } from '@mmo/ui';
import { Boxes } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function StockOverview() {
  const { data } = useQuery({ queryKey: ['seller-products-stock'], queryFn: () => api<any>('/seller/products?pageSize=100') });
  const autos = (data?.items ?? []).filter((p: any) => p.deliveryType === 'AUTO');
  return (
    <div>
      <PageHeader title="Kho hàng" subtitle="Tồn kho của các sản phẩm giao tự động. Sản phẩm dưới 20 item được đánh dấu sắp hết." />
      <Card>
        {!autos.length ? (
          <EmptyState icon={<Boxes className="h-6 w-6" />} title="Chưa có sản phẩm giao tự động" action={<Link href="/seller/san-pham/moi"><Button>Thêm sản phẩm</Button></Link>} />
        ) : (
          <Table>
            <thead><tr><TH>Sản phẩm</TH><TH align="right">Tồn kho</TH><TH align="right">Đã bán</TH><TH /></tr></thead>
            <tbody>
              {autos.sort((a: any, b: any) => a.stockTotal - b.stockTotal).map((p: any) => (
                <tr key={p.id} className="hover:bg-subtle/50">
                  <TD className="font-medium">{p.title}</TD>
                  <TD align="right" className={cn('font-semibold', p.stockTotal === 0 ? 'text-danger' : p.stockTotal < 20 ? 'text-warning' : '')}>{num(p.stockTotal)}{p.stockTotal < 20 && <span className="ml-1 text-xs font-normal">{p.stockTotal === 0 ? '(hết hàng)' : '(sắp hết)'}</span>}</TD>
                  <TD align="right">{num(p.soldCount)}</TD>
                  <TD align="right"><Link href={`/seller/san-pham/${p.id}?tab=stock`}><Button size="sm" variant="outline">Nhập kho</Button></Link></TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
