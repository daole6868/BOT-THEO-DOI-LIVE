'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, PageHeader, Pagination, TD, TH, Table, cn, dateTime } from '@mmo/ui';
import { CheckCircle2, ChevronRight, Link2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { Chips, SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

const PREFIXES = [
  { value: '', label: 'Tất cả' },
  { value: 'withdrawal.', label: 'Rút tiền' },
  { value: 'adjustment.', label: 'Điều chỉnh số dư' },
  { value: 'stock.', label: 'Xem hàng số' },
  { value: 'user.', label: 'Người dùng' },
  { value: 'seller.', label: 'Duyệt người bán' },
  { value: 'kyc.', label: 'Xem KYC' },
  { value: 'dispute', label: 'Khiếu nại' },
  { value: 'settings', label: 'Cấu hình' },
  { value: 'killswitch', label: 'Công tắc khẩn cấp' },
  { value: 'staff', label: 'Nhân sự' },
  { value: 'auth.', label: 'Đăng nhập' },
];
const SENSITIVE = /reveal|view_content|kyc\.view|killswitch|mfa_reset|banned|adjustment\.approve|chat\.view_direct|sessions\.revoke/;

export default function AuditPage() {
  const { run, busy } = useRun();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [chain, setChain] = useState<any>(null);
  const params = new URLSearchParams({ page: String(page), ...(action && { action }), ...(actor && { actor }), ...(target && { target }) });
  const { data } = useQuery({ queryKey: ['adm-audit', params.toString()], queryFn: () => api<any>(`/admin/system/audit?${params}`), placeholderData: keepPreviousData });
  return (
    <div>
      <PageHeader
        title="Nhật ký kiểm toán"
        subtitle="Chỉ ghi thêm, không thể sửa hoặc xoá. Mỗi dòng chứa hash của dòng trước – sửa một dòng sẽ làm đứt chuỗi."
        actions={<Button variant="outline" loading={busy === 'chain'} onClick={() => run('chain', async () => setChain(await api('/admin/system/audit/verify')))}><Link2 className="h-4 w-4" /> Kiểm tra toàn vẹn chuỗi</Button>}
      />
      {chain && (
        <p className={cn('mb-4 flex items-center gap-2 rounded-xl p-3 text-sm', chain.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
          {chain.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {chain.ok ? `Chuỗi toàn vẹn – đã kiểm tra ${chain.checked.toLocaleString('vi-VN')} bản ghi.` : `Phát hiện chuỗi bị sửa tại bản ghi #${chain.brokenAt}! Báo ngay cho Super Admin.`}
        </p>
      )}
      <Card>
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex flex-wrap gap-3">
            <SearchInput value={actor} onChange={(v) => { setActor(v); setPage(1); }} placeholder="Người thực hiện (username / ID)" className="w-64" />
            <SearchInput value={target} onChange={(v) => { setTarget(v); setPage(1); }} placeholder="ID đối tượng" className="w-64" />
          </div>
          <Chips value={action} onChange={(v) => { setAction(v); setPage(1); }} items={PREFIXES} />
        </div>
        {!data?.items.length ? (
          <EmptyState title="Không có bản ghi" />
        ) : (
          <Table>
            <thead><tr><TH /><TH>#</TH><TH>Thời gian</TH><TH>Người thực hiện</TH><TH>Hành động</TH><TH>Đối tượng</TH><TH>Lý do</TH><TH>IP</TH></tr></thead>
            <tbody>
              {data.items.map((r: any) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-subtle/50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <TD className="w-6"><ChevronRight className={cn('h-4 w-4 text-muted transition', open === r.id && 'rotate-90')} /></TD>
                    <TD className="font-mono text-xs text-muted">{r.id}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{dateTime(r.createdAt)}</TD>
                    <TD>{r.actor ? <Link href={`/nguoi-dung/${r.actor.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">{r.actor.displayName} {r.actor.isStaff && <Badge tone="primary">NV</Badge>}</Link> : <span className="text-muted">Hệ thống</span>}</TD>
                    <TD><code className={cn('rounded px-1.5 py-0.5 text-xs', SENSITIVE.test(r.action) ? 'bg-warning-soft text-warning' : 'bg-subtle')}>{r.action}</code></TD>
                    <TD className="text-xs">{r.targetType && <span className="text-muted">{r.targetType} </span>}<span className="font-mono">{r.targetId?.slice(0, 13)}{r.targetId?.length > 13 && '…'}</span></TD>
                    <TD className="max-w-xs truncate text-xs text-fg2" title={r.reason ?? ''}>{r.reason ?? '—'}</TD>
                    <TD className="font-mono text-xs text-muted">{r.actorIp}</TD>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={8} className="bg-subtle/60 px-6 py-3 text-xs">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1 font-semibold text-muted">Dữ liệu</p>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card p-2">{r.data ? JSON.stringify(r.data, null, 2) : '—'}</pre>
                          </div>
                          <div className="space-y-1">
                            <p><span className="text-muted">Đối tượng đầy đủ:</span> <span className="font-mono">{r.targetId ?? '—'}</span></p>
                            <p><span className="text-muted">Thiết bị:</span> {r.actorUa ?? '—'}</p>
                            <p className="break-all"><span className="text-muted">Hash:</span> <span className="font-mono">{r.hash}</span></p>
                            <p className="break-all"><span className="text-muted">Hash trước:</span> <span className="font-mono">{r.prevHash ?? '(gốc)'}</span></p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}
