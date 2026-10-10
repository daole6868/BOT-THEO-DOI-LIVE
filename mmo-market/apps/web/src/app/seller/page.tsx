'use client';
import { useQuery } from '@tanstack/react-query';
import { BarList, Card, CardBody, CardHeader, ColumnChart, Countdown, LevelBadge, LEVELS, Meter, ORDER_STATUS, PageHeader, Skeleton, StatCard, TD, TH, Table, TrendChart, cn, num, pct, shortVnd, vnd } from '@mmo/ui';
import { AlertTriangle, Boxes, Clock, MessageCircle, PackageCheck, Star, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function SellerDashboard() {
  const [range, setRange] = useState(30);
  const router = useRouter();
  const { data: d, isLoading } = useQuery({ queryKey: ['seller-dashboard', range], queryFn: () => api<any>(`/seller/dashboard?range=${range}`), refetchInterval: 60_000 });
  return (
    <div>
      <PageHeader
        title="Tổng quan gian hàng"
        subtitle="Số liệu cập nhật theo thời gian thực từ đơn hàng và ký quỹ."
        actions={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {[7, 30, 90].map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', range === r ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg')}>
                {r} ngày
              </button>
            ))}
          </div>
        }
      />
      {isLoading || !d ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Doanh số (GMV)" value={shortVnd(d.kpis.gmv.value)} delta={d.kpis.gmv.delta} spark={d.series.map((s: any) => s.gmv)} href="/seller/don-hang" />
            <StatCard label="Thu nhập thực nhận" value={shortVnd(d.kpis.net.value)} delta={d.kpis.net.delta} hint="Sau phí sàn, đơn đã hoàn tất" href="/seller/tai-chinh" />
            <StatCard label="Đơn hàng" value={num(d.kpis.orders.value)} delta={d.kpis.orders.delta} spark={d.series.map((s: any) => s.orders)} href="/seller/don-hang" />
            <StatCard label="Sẽ giải ngân trong 24h" value={shortVnd(d.kpis.releasing24h)} hint={`Đang giữ: ${shortVnd(d.kpis.incomingEscrow)}`} icon={<Clock className="h-4 w-4" />} href="/seller/tai-chinh" />
            <StatCard label="Số dư khả dụng" value={shortVnd(d.kpis.available)} hint="Rút về ngân hàng →" icon={<Wallet className="h-4 w-4" />} href="/seller/tai-chinh" tone={d.kpis.disputeRatePct > 3 ? 'warning' : 'default'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader title={`Doanh số & đơn hàng ${range} ngày`} subtitle="Nét đứt: cùng kỳ trước để so sánh" />
              <CardBody>
                <TrendChart data={d.series} metrics={[{ key: 'gmv', prevKey: 'prevGmv', label: 'Doanh số', money: true }, { key: 'orders', prevKey: 'prevOrders', label: 'Số đơn' }]} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Việc cần làm" subtitle="Ưu tiên theo mức khẩn" />
              <CardBody className="space-y-2">
                {d.todo.disputes.map((x: any) => (
                  <Link key={x.id} href="/seller/khieu-nai" className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-2.5 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                    <span className="flex-1">Khiếu nại <b>{x.code}</b></span>
                    <Countdown to={x.deadline} className="text-xs font-semibold text-danger" />
                  </Link>
                ))}
                {[
                  { n: d.todo.toAccept, label: 'đơn dịch vụ chờ nhận', href: '/seller/don-hang?status=PAID', icon: PackageCheck, tone: 'warning' },
                  { n: d.todo.inProgress, label: 'đơn đang thực hiện', href: '/seller/don-hang?status=IN_PROGRESS', icon: Clock, tone: 'info' },
                  { n: d.todo.lowStock.length, label: 'sản phẩm sắp hết kho (< 20)', href: '/seller/kho', icon: Boxes, tone: 'warning' },
                  { n: d.todo.unreadMessages, label: 'tin nhắn chưa đọc', href: '/tai-khoan/tin-nhan', icon: MessageCircle, tone: 'info' },
                  { n: d.todo.unrepliedReviews, label: 'đánh giá chưa phản hồi', href: '/seller/danh-gia', icon: Star, tone: 'neutral' },
                  { n: d.todo.productsNeedAttention, label: 'sản phẩm chờ duyệt / bị từ chối', href: '/seller/san-pham', icon: Boxes, tone: 'neutral' },
                ]
                  .filter((t) => t.n > 0)
                  .map((t) => (
                    <Link key={t.label} href={t.href} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm hover:bg-subtle">
                      <t.icon className={cn('h-4 w-4 shrink-0', t.tone === 'warning' ? 'text-warning' : t.tone === 'info' ? 'text-info' : 'text-muted')} />
                      <span className="flex-1"><b className="tabular">{t.n}</b> {t.label}</span>
                      <span className="text-muted">→</span>
                    </Link>
                  ))}
                {!d.todo.disputes.length && !d.todo.toAccept && !d.todo.lowStock.length && !d.todo.unreadMessages && !d.todo.unrepliedReviews && !d.todo.inProgress && (
                  <p className="py-6 text-center text-sm text-muted">🎉 Không có việc tồn đọng</p>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Đơn theo trạng thái" subtitle={`${range} ngày qua · bấm để lọc`} />
              <CardBody>
                <BarList
                  items={Object.entries(d.ordersByStatus as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => ({ key: k, label: ORDER_STATUS[k]?.label ?? k, value: v }))}
                  onClick={(k) => router.push(`/seller/don-hang?status=${k}`)}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Lịch giải ngân 7 ngày tới" subtitle="Tiền escrow dự kiến về ví khả dụng" />
              <CardBody>
                {d.releaseSchedule.length ? (
                  <ColumnChart data={d.releaseSchedule} xKey="day" yKey="amount" label="Giải ngân" money xFormat={(v) => v.slice(8, 10) + '/' + v.slice(5, 7)} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted">Không có khoản nào đến hạn</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Hiệu suất & cấp độ" />
              <CardBody className="space-y-4">
                <div className="flex items-center gap-3">
                  <LevelBadge level={d.performance.level} className="text-sm" />
                  {d.performance.nextLevel && <span className="text-xs text-muted">→ {LEVELS[d.performance.nextLevel]?.icon} {LEVELS[d.performance.nextLevel]?.label}</span>}
                </div>
                {d.performance.nextLevel ? (
                  <Meter value={d.performance.progressPct} label={`Tiến độ lên cấp: ${d.performance.progressPct}% · cần thêm ${num(d.performance.ordersToNext)} đơn hoàn tất`} />
                ) : (
                  <p className="text-sm text-success">Bạn đang ở cấp cao nhất 💎</p>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-subtle p-3"><dt className="text-xs text-muted">Đánh giá TB</dt><dd className="text-lg font-bold">{d.performance.ratingAvg.toFixed(1)} ⭐</dd></div>
                  <div className="rounded-lg bg-subtle p-3"><dt className="text-xs text-muted">Tỷ lệ khiếu nại</dt><dd className={cn('text-lg font-bold', d.performance.lifetimeDisputeRatePct > 3 ? 'text-danger' : 'text-fg')}>{pct(d.performance.lifetimeDisputeRatePct)}</dd></div>
                  <div className="rounded-lg bg-subtle p-3"><dt className="text-xs text-muted">Đơn hoàn tất</dt><dd className="text-lg font-bold">{num(d.performance.completedOrders)}</dd></div>
                  <div className="rounded-lg bg-subtle p-3"><dt className="text-xs text-muted">Lượt đánh giá</dt><dd className="text-lg font-bold">{num(d.performance.ratingCount)}</dd></div>
                </dl>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Sản phẩm nổi bật" subtitle={`Theo doanh số ${range} ngày · chuyển đổi = đơn / lượt xem`} action={<Link href="/seller/san-pham" className="text-sm text-primary hover:underline">Quản lý sản phẩm →</Link>} />
            <Table>
              <thead><tr><TH>Sản phẩm</TH><TH align="right">Doanh số</TH><TH align="right">Đơn</TH><TH align="right">Tồn kho</TH><TH>Chuyển đổi</TH></tr></thead>
              <tbody>
                {d.topProducts.map((p: any) => {
                  const maxConv = Math.max(1, ...d.topProducts.map((x: any) => x.conversionPct));
                  return (
                    <tr key={p.id} className="hover:bg-subtle/50">
                      <TD><Link href={`/seller/san-pham/${p.id}`} className="font-medium hover:text-primary">{p.title}</Link></TD>
                      <TD align="right" className="font-semibold">{vnd(p.gmv)}</TD>
                      <TD align="right">{num(p.orders)}</TD>
                      <TD align="right" className={cn(p.delivery === 'AUTO' && p.stock < 20 && 'font-semibold text-warning')}>{p.delivery === 'AUTO' ? num(p.stock) : '—'}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-subtle"><div className="h-2 rounded-full" style={{ width: `${(p.conversionPct / maxConv) * 100}%`, background: 'var(--chart-1)' }} /></div>
                          <span className="text-xs tabular text-fg2">{pct(p.conversionPct)}</span>
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
