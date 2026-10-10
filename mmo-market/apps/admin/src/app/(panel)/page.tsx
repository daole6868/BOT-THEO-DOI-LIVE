'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, BarList, Card, CardBody, CardHeader, Heatmap, LevelBadge, PageHeader, Skeleton, StatCard, TD, TH, Table, TrendChart, cn, num, pct, shortVnd, timeAgo, vnd } from '@mmo/ui';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, ClipboardCheck, Clock, Database, Flag, Headset, Landmark, MessagesSquare, Package, ShieldAlert, Users, Wallet, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

const JOBS: Record<string, { label: string; maxMin: number }> = {
  'escrow.release': { label: 'Giải ngân ký quỹ', maxMin: 3 },
  'dispute.auto': { label: 'Tự xử lý khiếu nại quá hạn', maxMin: 5 },
  'order.service_timeout': { label: 'Đơn dịch vụ quá hạn', maxMin: 12 },
  'deposit.expire': { label: 'Hết hạn lệnh nạp', maxMin: 12 },
  'post.expire': { label: 'Hết hạn bài đăng', maxMin: 25 },
  'ledger.verify': { label: 'Đối soát sổ cái', maxMin: 26 * 60 },
  'seller.levels': { label: 'Xét cấp gian hàng', maxMin: 26 * 60 },
  cleanup: { label: 'Dọn dẹp dữ liệu', maxMin: 26 * 60 },
};

export default function Dashboard() {
  const [range, setRange] = useState(30);
  const { data: d, isLoading } = useQuery({ queryKey: ['admin-dashboard', range], queryFn: () => api<any>(`/admin/dashboard?range=${range}`), refetchInterval: 60_000 });

  return (
    <div>
      <PageHeader
        title="Tổng quan sàn"
        subtitle="Số liệu kinh doanh, hàng đợi cần xử lý và sức khoẻ hệ thống. Tự làm mới mỗi phút."
        actions={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Khoảng thời gian">
            {[7, 30, 90].map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', range === r ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg')}>
                {r} ngày
              </button>
            ))}
          </div>
        }
      />
      {isLoading || !d ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={`GMV ${range} ngày`} value={shortVnd(d.kpis.gmv.value)} delta={d.kpis.gmv.delta} spark={d.series.map((s: any) => s.gmv)} href="/don-hang" />
            <StatCard label="Doanh thu phí sàn" value={shortVnd(d.kpis.feeRevenue.value)} delta={d.kpis.feeRevenue.delta} spark={d.series.map((s: any) => s.fee)} href="/tai-chinh" />
            <StatCard label="Đơn hàng" value={num(d.kpis.orders.value)} delta={d.kpis.orders.delta} spark={d.series.map((s: any) => s.orders)} href="/don-hang" />
            <StatCard label="Người dùng mới" value={num(d.kpis.newUsers.value)} delta={d.kpis.newUsers.delta} hint={`${num(d.kpis.onlineUsers)} người đang online`} icon={<Users className="h-4 w-4" />} href="/nguoi-dung" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-success-soft text-success"><ArrowDownLeft className="h-5 w-5" /></span>
              <div><p className="text-xs text-muted">Nạp hôm nay</p><p className="font-semibold tabular">{vnd(d.kpis.depositsToday.amount)} <span className="text-xs font-normal text-muted">· {d.kpis.depositsToday.count} lệnh</span></p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning-soft text-warning"><ArrowUpRight className="h-5 w-5" /></span>
              <div><p className="text-xs text-muted">Đã chi trả rút hôm nay</p><p className="font-semibold tabular">{vnd(d.kpis.withdrawalsToday.amount)} <span className="text-xs font-normal text-muted">· {d.kpis.withdrawalsToday.count} lệnh</span></p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-info-soft text-info"><Wallet className="h-5 w-5" /></span>
              <div><p className="text-xs text-muted">Đang giữ trong ký quỹ</p><p className="font-semibold tabular">{vnd(d.kpis.escrowHolding)}</p></div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader title={`Xu hướng ${range} ngày`} subtitle="Chọn chỉ số để xem · nét đứt là cùng kỳ trước" />
              <CardBody>
                <TrendChart data={d.series} metrics={[{ key: 'gmv', prevKey: 'prevGmv', label: 'GMV', money: true }, { key: 'orders', prevKey: 'prevOrders', label: 'Số đơn' }, { key: 'fee', label: 'Phí sàn', money: true }]} />
              </CardBody>
            </Card>
            <QueuePanel q={d.queues} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader title="GMV theo danh mục" subtitle={`${range} ngày, đã trừ hoàn tiền`} />
              <CardBody>
                <BarList money items={d.gmvByCategory.map((c: any) => ({ key: c.name, label: c.name, value: c.gmv, hint: `${num(c.orders)} đơn` }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Giờ cao điểm" subtitle="Số đơn theo giờ trong 4 tuần gần nhất" />
              <CardBody><Heatmap cells={d.heatmap} /></CardBody>
            </Card>
            <RiskPanel risk={d.risk} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="min-w-0">
              <CardHeader title="Gian hàng dẫn đầu" subtitle={`Theo GMV ${range} ngày · tỷ lệ khiếu nại trên đơn hoàn tất`} action={<Link href="/gian-hang" className="text-sm text-primary hover:underline">Tất cả →</Link>} />
              <Table>
                <thead><tr><TH>Gian hàng</TH><TH>Cấp</TH><TH align="right">GMV</TH><TH align="right">Đơn</TH><TH align="right">Khiếu nại</TH></tr></thead>
                <tbody>
                  {d.topStores.map((s: any) => (
                    <tr key={s.slug}>
                      <TD className="font-medium">{s.name}</TD>
                      <TD><LevelBadge level={s.level} /></TD>
                      <TD align="right" className="font-semibold">{vnd(s.gmv)}</TD>
                      <TD align="right">{num(s.orders)}</TD>
                      <TD align="right"><span className={cn(s.disputeRatePct > 3 && 'font-semibold text-danger')}>{pct(s.disputeRatePct)}</span></TD>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <HealthPanel ledger={d.ledger} health={d.health} />
          </div>
        </div>
      )}
    </div>
  );
}

function QueuePanel({ q }: { q: Record<string, number> }) {
  const rows = [
    { n: q.escalatedDisputes, label: 'Khiếu nại chờ admin phân xử', href: '/khieu-nai', icon: AlertTriangle, urgent: true },
    { n: q.supportQueued, label: 'Khách đang chờ hỗ trợ', href: '/ho-tro', icon: Headset, urgent: true },
    { n: q.withdrawalsPending, label: 'Lệnh rút chờ duyệt / chuyển', href: '/tai-chinh?tab=withdrawals', icon: Landmark },
    { n: q.withdrawalsOnHold, label: 'Lệnh rút đang giữ lại', href: '/tai-chinh?tab=withdrawals&status=ON_HOLD', icon: ShieldAlert },
    { n: q.unmatchedDeposits + q.depositClaims, label: 'Nạp tiền chưa khớp / báo nhầm', href: '/tai-chinh?tab=bank', icon: ArrowDownLeft },
    { n: q.adjustmentsPending, label: 'Điều chỉnh số dư chờ duyệt (4 mắt)', href: '/tai-chinh?tab=adjustments', icon: Wallet },
    { n: q.sellerApplications, label: 'Hồ sơ người bán chờ duyệt', href: '/ho-so-ban-hang', icon: ClipboardCheck },
    { n: q.productsPending, label: 'Sản phẩm chờ duyệt', href: '/san-pham', icon: Package },
    { n: q.postsPending, label: 'Bài đăng chờ duyệt', href: '/cong-dong', icon: MessagesSquare },
    { n: q.reportsOpen, label: 'Báo cáo vi phạm mới', href: '/bao-cao', icon: Flag },
  ];
  const total = rows.reduce((s, r) => s + r.n, 0);
  return (
    <Card>
      <CardHeader title="Việc cần xử lý" subtitle={total ? `${num(total)} việc đang chờ` : 'Không có việc tồn đọng'} />
      <ul className="px-3 pb-3">
        {rows.map((r) => (
          <li key={r.href + r.label}>
            <Link href={r.href} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-subtle', r.n === 0 && 'text-muted')}>
              <r.icon className={cn('h-4 w-4 shrink-0', r.n > 0 && r.urgent ? 'text-danger' : r.n > 0 ? 'text-primary' : '')} />
              <span className="flex-1">{r.label}</span>
              <span className={cn('min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular', r.n === 0 ? 'bg-subtle' : r.urgent ? 'bg-danger text-white' : 'bg-primary-soft text-primary')}>{r.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RiskPanel({ risk }: { risk: any }) {
  const empty = !risk.flaggedUsers.length && !risk.heldWithdrawals.length && !risk.highDisputeStores.length && !risk.bruteForceIps.length;
  return (
    <Card>
      <CardHeader title="Cảnh báo rủi ro" subtitle="Tự động phát hiện" />
      <CardBody className="space-y-3 text-sm">
        {empty && <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" /> Không có cảnh báo</p>}
        {risk.bruteForceIps.map((x: any) => (
          <p key={x.ip} className="flex items-center gap-2 rounded-lg bg-danger-soft p-2 text-danger"><ShieldAlert className="h-4 w-4 shrink-0" /> IP {x.ip}: {x.attempts} lần đăng nhập sai / giờ</p>
        ))}
        {risk.highDisputeStores.map((s: any) => (
          <div key={s.slug} className="flex items-center justify-between gap-2">
            <span className="truncate">Gian hàng <b>{s.name}</b></span>
            <Badge tone="danger">khiếu nại {pct(s.rate)}</Badge>
          </div>
        ))}
        {risk.heldWithdrawals.map((w: any) => (
          <Link key={w.code} href="/tai-chinh?tab=withdrawals&status=ON_HOLD" className="flex items-center justify-between gap-2 hover:text-primary">
            <span className="truncate">Lệnh rút <code className="text-xs">{w.code}</code> · {vnd(w.amount)}</span>
            <Badge tone="warning">{w.flags.join(', ') || 'giữ lại'}</Badge>
          </Link>
        ))}
        {risk.flaggedUsers.map((u: any) => (
          <Link key={u.id} href={`/nguoi-dung/${u.id}`} className="flex items-center justify-between gap-2 hover:text-primary">
            <span className="truncate">@{u.username}</span>
            <Badge tone="warning">{u.riskFlags.join(', ')}</Badge>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

function HealthPanel({ ledger, health }: { ledger: any; health: any }) {
  return (
    <Card>
      <CardHeader title="Sức khoẻ hệ thống" />
      <CardBody className="space-y-3 text-sm">
        <Link href="/tai-chinh?tab=ledger" className={cn('flex items-start gap-2.5 rounded-lg p-3', !ledger ? 'bg-subtle' : ledger.ok ? 'bg-success-soft' : 'bg-danger-soft')}>
          {ledger?.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : ledger ? <XCircle className="mt-0.5 h-4 w-4 text-danger" /> : <Clock className="mt-0.5 h-4 w-4 text-muted" />}
          <span>
            <span className="font-semibold">{!ledger ? 'Chưa đối soát sổ cái' : ledger.ok ? 'Sổ cái cân bằng' : `Sổ cái lệch: ${ledger.problems.length} vấn đề`}</span>
            {ledger && <span className="block text-xs text-muted">Lần kiểm tra: {timeAgo(ledger.at)}</span>}
          </span>
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-subtle p-2.5"><p className="flex items-center gap-1.5 text-xs text-muted"><Database className="h-3.5 w-3.5" /> PostgreSQL</p><p className="font-semibold tabular">{health.dbMs} ms</p></div>
          <div className="rounded-lg bg-subtle p-2.5"><p className="flex items-center gap-1.5 text-xs text-muted"><Database className="h-3.5 w-3.5" /> Redis</p><p className="font-semibold tabular">{health.redisMs} ms</p></div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">Tác vụ định kỳ</p>
          <ul className="space-y-1">
            {Object.entries(JOBS).map(([k, j]) => {
              const at = health.jobs?.[k];
              const late = !at || Date.now() - new Date(at).getTime() > j.maxMin * 60_000;
              return (
                <li key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">{late ? <Clock className="h-3.5 w-3.5 text-warning" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}{j.label}</span>
                  <span className="text-muted">{at ? timeAgo(at) : 'chưa chạy'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
