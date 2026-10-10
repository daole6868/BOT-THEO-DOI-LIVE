'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Input, LevelBadge, ORDER_STATUS, Skeleton, StatCard, StatusBadge, TD, TH, Table, dateTime, num, timeAgo, vnd } from '@mmo/ui';
import { Clock, Eye, KeyRound, Lock, ShieldCheck, ShieldOff, Unlock, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { api } from '@/lib/api';
import { useCan } from '@/lib/hooks';
import { USER_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

type Act = null | 'reveal' | 'LOCKED' | 'BANNED' | 'ACTIVE' | 'mfa';

export default function User360() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const { run } = useRun();
  const { data: u, refetch } = useQuery({ queryKey: ['adm-user', id], queryFn: () => api<any>(`/admin/users/${id}`) });
  const [act, setAct] = useState<Act>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [flags, setFlags] = useState<string | null>(null);
  if (!u) return <Skeleton className="h-96" />;

  const submit = async (reason: string) => {
    if (act === 'reveal') {
      await run('reveal', async () => setEmail((await api<{ email: string }>(`/admin/users/${id}/reveal-email`, { body: { reason } })).email));
    } else if (act === 'mfa') {
      await run('mfa', () => api(`/admin/users/${id}/mfa-reset`, { body: { reason } }), 'Đã đặt lại 2FA, rút tiền bị khoá 72 giờ');
    } else if (act) {
      await run('status', () => api(`/admin/users/${id}/status`, { body: { status: act, reason } }), 'Đã cập nhật trạng thái');
    }
    setAct(null);
    refetch();
  };
  const totalOf = (rows: any[]) => rows.reduce((s, r) => s + Number(r.total), 0);
  const countOf = (rows: any[]) => rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <Link href="/nguoi-dung" className="text-xs text-muted hover:text-fg">← Người dùng</Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={u.avatarUrl} name={u.displayName} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">{u.displayName} <StatusBadge map={USER_STATUS} value={u.status} /> {u.isStaff && <Badge tone="primary">{u.role}</Badge>}</h1>
            <p className="text-sm text-muted">@{u.username} · ID <code className="text-xs">{u.id}</code></p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{email ?? u.email}</span>
              {!email && <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setAct('reveal')}><Eye className="h-3.5 w-3.5" /> Hiện email</button>}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge tone={u.mfaEnabled ? 'success' : 'neutral'}>{u.mfaEnabled ? <><ShieldCheck className="h-3 w-3" /> 2FA bật</> : <><ShieldOff className="h-3 w-3" /> 2FA tắt</>}</Badge>
              <Badge>Tham gia {timeAgo(u.createdAt)}</Badge>
              {u.lastLoginAt && <Badge>Đăng nhập {timeAgo(u.lastLoginAt)} · {u.lastLoginIp}</Badge>}
              {u.withdrawLockedUntil && new Date(u.withdrawLockedUntil) > new Date() && <Badge tone="warning"><Clock className="h-3 w-3" /> Khoá rút đến {dateTime(u.withdrawLockedUntil)}</Badge>}
            </div>
          </div>
          {can('user.lock') && (
            <div className="flex flex-wrap gap-2">
              {u.status === 'ACTIVE' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setAct('LOCKED')}><Lock className="h-4 w-4" /> Tạm khoá</Button>
                  <Button size="sm" variant="danger" onClick={() => setAct('BANNED')}>Cấm vĩnh viễn</Button>
                </>
              ) : (
                <Button size="sm" variant="success" onClick={() => setAct('ACTIVE')}><Unlock className="h-4 w-4" /> Mở khoá</Button>
              )}
              {can('user.mfa_reset') && u.mfaEnabled && <Button size="sm" variant="ghost" onClick={() => setAct('mfa')}><KeyRound className="h-4 w-4" /> Đặt lại 2FA</Button>}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Số dư khả dụng" value={vnd(u.balances.available)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Đã mua" value={vnd(totalOf(u.purchases))} hint={`${num(countOf(u.purchases))} đơn · ${u.disputesOpened} khiếu nại đã mở`} />
        <StatCard label="Đã bán" value={vnd(totalOf(u.sales))} hint={u.store ? `${num(countOf(u.sales))} đơn` : 'Không phải người bán'} />
        <StatCard label="Bị báo cáo" value={num(u.reportsAgainst)} tone={u.reportsAgainst > 2 ? 'warning' : 'default'} hint={`Ký quỹ đến: ${vnd(u.balances.incomingEscrow)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {u.store && (
          <Card>
            <CardHeader title="Gian hàng" action={<a href={`${process.env.NEXT_PUBLIC_WEB_URL}/shop/${u.store.slug}`} target="_blank" rel="noreferrer" className="text-sm text-primary">Xem shop ↗</a>} />
            <CardBody className="space-y-1.5 text-sm">
              <p className="flex items-center gap-2 font-semibold">{u.store.name} <LevelBadge level={u.store.level} /></p>
              <p className="text-fg2">Hoàn tất {num(u.store.completedOrders)} đơn · {u.store.disputeCount} khiếu nại · ★ {u.store.ratingAvg.toFixed(1)} ({u.store.ratingCount})</p>
              {u.application && <p className="text-xs text-muted">KYC: {u.application.fullName} · duyệt {u.application.reviewedAt ? dateTime(u.application.reviewedAt) : '—'}</p>}
              <Link href={`/gian-hang?q=${encodeURIComponent(u.store.slug)}`} className="text-xs text-primary hover:underline">Quản lý cấp / phí / khoá →</Link>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Đơn mua theo trạng thái" />
          <CardBody className="flex flex-wrap gap-2">
            {u.purchases.length ? u.purchases.map((p: any) => <span key={p.status} className="inline-flex items-center gap-1.5"><StatusBadge map={ORDER_STATUS} value={p.status} /><b className="text-sm tabular">{p.count}</b></span>) : <p className="text-sm text-muted">Chưa mua đơn nào</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cờ rủi ro" subtitle="Gắn cờ để lệnh rút tự động bị giữ lại kiểm tra" />
          <CardBody className="space-y-2">
            <div className="flex flex-wrap gap-1.5">{u.riskFlags.length ? u.riskFlags.map((f: string) => <Badge key={f} tone="warning">{f}</Badge>) : <span className="text-sm text-muted">Không có</span>}</div>
            {can('user.lock') && (
              <div className="flex gap-2">
                <Input value={flags ?? u.riskFlags.join(', ')} onChange={(e) => setFlags(e.target.value)} placeholder="vd: multi_account, chargeback" className="h-9" />
                <Button size="sm" variant="outline" onClick={() => run('flags', () => api(`/admin/users/${id}/flags`, { body: { flags: (flags ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/[^a-z_]/g, '_')).filter((s) => s.length >= 2) } }), 'Đã lưu cờ').then(() => { setFlags(null); refetch(); })}>Lưu</Button>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tài khoản liên quan" subtitle="Đã đăng nhập thành công từ cùng địa chỉ IP" />
          <CardBody>
            {!u.relatedAccounts.length ? (
              <p className="text-sm text-muted">Không phát hiện</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {u.relatedAccounts.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/nguoi-dung/${r.id}`} className="hover:text-primary">@{r.username} · {r.displayName}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted">{r.sharedIp} <StatusBadge map={USER_STATUS} value={r.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Lịch sử đăng nhập" subtitle="20 lần gần nhất" />
        <Table>
          <thead><tr><TH>Thời gian</TH><TH>Khu vực</TH><TH>Kết quả</TH><TH>IP</TH><TH>Thiết bị</TH></tr></thead>
          <tbody>
            {u.logins.map((l: any, i: number) => (
              <tr key={i}>
                <TD className="whitespace-nowrap text-muted">{dateTime(l.createdAt)}</TD>
                <TD>{l.kind}</TD>
                <TD>{l.result === 'success' ? <Badge tone="success">Thành công</Badge> : <Badge tone="danger">{l.result}</Badge>}</TD>
                <TD className="font-mono text-xs">{l.ip}</TD>
                <TD className="max-w-xs truncate text-xs text-muted" title={l.userAgent}>{l.userAgent}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <ReasonModal
        open={!!act}
        onClose={() => setAct(null)}
        title={act === 'reveal' ? 'Hiện email đầy đủ' : act === 'mfa' ? 'Đặt lại 2FA' : act === 'ACTIVE' ? 'Mở khoá tài khoản' : act === 'BANNED' ? 'Cấm vĩnh viễn' : 'Tạm khoá tài khoản'}
        danger={act === 'BANNED' || act === 'LOCKED' || act === 'mfa'}
        onSubmit={submit}
      >
        {act === 'BANNED' && <p className="rounded-lg bg-danger-soft p-2.5 text-xs text-danger">Đăng xuất mọi phiên và khoá gian hàng (nếu có). Số dư và đơn đang xử lý vẫn được giữ để đối soát.</p>}
        {act === 'mfa' && <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">Chỉ đặt lại sau khi đã xác minh danh tính chủ tài khoản qua kênh khác. Rút tiền sẽ bị khoá 72 giờ.</p>}
      </ReasonModal>
    </div>
  );
}
