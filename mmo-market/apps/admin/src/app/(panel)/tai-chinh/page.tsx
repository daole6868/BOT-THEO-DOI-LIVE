'use client';
import { Card, PageHeader, Tabs } from '@mmo/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCan } from '@/lib/hooks';
import { Adjustments } from './Adjustments';
import { BankEvents, Claims, Deposits } from './Deposits';
import { Ledger } from './Ledger';
import { Withdrawals } from './Withdrawals';

function Finance() {
  const can = useCan();
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tabs = [
    { value: 'withdrawals', label: 'Lệnh rút', ok: can('withdrawal.approve') || can('withdrawal.pay') },
    { value: 'deposits', label: 'Lệnh nạp', ok: can('deposit.manage') },
    { value: 'bank', label: 'Giao dịch NH chưa khớp', ok: can('deposit.manage') },
    { value: 'claims', label: 'Báo chuyển nhầm', ok: can('deposit.manage') },
    { value: 'adjustments', label: 'Điều chỉnh số dư', ok: can('adjustment.request') },
    { value: 'ledger', label: 'Sổ cái & đối soát', ok: can('ledger.view') },
  ].filter((t) => t.ok);
  const tab = tabs.find((t) => t.value === sp.get('tab'))?.value ?? tabs[0]?.value;
  return (
    <div>
      <PageHeader title="Tài chính" subtitle="Mọi biến động tiền đều đi qua sổ cái kép bất biến. Thao tác lớn áp dụng nguyên tắc 4 mắt (người tạo ≠ người duyệt)." />
      <Card>
        <Tabs value={tab} onChange={(v) => router.replace(`${path}?tab=${v}`)} className="px-3" items={tabs.map(({ value, label }) => ({ value, label }))} />
        {tab === 'withdrawals' && <Withdrawals initialStatus={sp.get('status') ?? 'REQUESTED'} />}
        {tab === 'deposits' && <Deposits />}
        {tab === 'bank' && <BankEvents />}
        {tab === 'claims' && <Claims />}
        {tab === 'adjustments' && <Adjustments />}
        {tab === 'ledger' && <Ledger />}
        {!tabs.length && <p className="p-6 text-sm text-muted">Bạn không có quyền tài chính.</p>}
      </Card>
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense>
      <Finance />
    </Suspense>
  );
}
