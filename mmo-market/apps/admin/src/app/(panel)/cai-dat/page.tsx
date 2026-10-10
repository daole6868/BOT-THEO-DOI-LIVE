'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Input, PageHeader, Switch, Textarea, cn, vnd } from '@mmo/ui';
import { AlertOctagon, LogOut, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { api } from '@/lib/api';
import { useRun } from '@/lib/useRun';

const KS: { key: string; label: string; desc: string }[] = [
  { key: 'orders', label: 'Tạm dừng đặt hàng', desc: 'Không ai tạo được đơn mới. Đơn đang xử lý vẫn chạy bình thường.' },
  { key: 'deposits', label: 'Tạm dừng nạp tiền', desc: 'Ẩn mã QR nạp tiền, webhook vẫn ghi nhận giao dịch đã chuyển.' },
  { key: 'withdrawals', label: 'Tạm dừng rút tiền', desc: 'Người bán không tạo được lệnh rút mới.' },
  { key: 'registration', label: 'Tạm dừng đăng ký', desc: 'Chặn tạo tài khoản mới (khi bị spam / tấn công).' },
  { key: 'chat', label: 'Tạm dừng chat', desc: 'Khoá gửi tin nhắn giữa người dùng (hỗ trợ vẫn hoạt động).' },
];

type FieldDef = { key: string; label: string; kind: 'money' | 'number' | 'json' | 'list' | 'text' | 'bps'; hint?: string };
const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Phí & ký quỹ',
    fields: [
      { key: 'fees.defaultBps', label: 'Phí sàn mặc định', kind: 'bps', hint: 'Áp dụng khi danh mục không đặt phí riêng' },
      { key: 'hold.hoursByLevel', label: 'Thời gian giữ ký quỹ tối thiểu theo cấp (giờ)', kind: 'json' },
      { key: 'product.autoApproveLevels', label: 'Cấp được duyệt sản phẩm tự động', kind: 'list', hint: 'Phân tách bằng dấu phẩy' },
      { key: 'levels.rules', label: 'Điều kiện lên cấp', kind: 'json' },
    ],
  },
  {
    title: 'Nạp & rút',
    fields: [
      { key: 'deposit.minAmount', label: 'Nạp tối thiểu', kind: 'money' },
      { key: 'deposit.maxAmount', label: 'Nạp tối đa mỗi lệnh', kind: 'money' },
      { key: 'deposit.expireMinutes', label: 'Lệnh nạp hết hạn sau (phút)', kind: 'number' },
      { key: 'withdraw.minAmount', label: 'Rút tối thiểu', kind: 'money' },
      { key: 'withdraw.fourEyesThreshold', label: 'Ngưỡng rút cần 2 người (4 mắt)', kind: 'money' },
      { key: 'withdraw.dailyLimitByLevel', label: 'Hạn mức rút 24 giờ theo cấp (đ)', kind: 'json' },
      { key: 'order.stepUpThreshold', label: 'Đơn từ mức này phải xác thực 2FA', kind: 'money' },
    ],
  },
  {
    title: 'Thời hạn xử lý',
    fields: [
      { key: 'dispute.sellerResponseHours', label: 'Người bán phản hồi khiếu nại trong (giờ)', kind: 'number' },
      { key: 'dispute.buyerResponseHours', label: 'Người mua phản hồi trong (giờ)', kind: 'number' },
      { key: 'service.acceptHours', label: 'Người bán nhận đơn dịch vụ trong (giờ)', kind: 'number' },
      { key: 'site.announcement', label: 'Thông báo hiển thị đầu trang web', kind: 'text', hint: 'Để trống để ẩn' },
    ],
  },
];

const toText = (kind: FieldDef['kind'], v: unknown) => (kind === 'json' ? JSON.stringify(v, null, 2) : kind === 'list' ? (v as string[]).join(', ') : kind === 'bps' ? String(Number(v) / 100) : String(v ?? ''));
function parse(kind: FieldDef['kind'], s: string): unknown {
  if (kind === 'json') return JSON.parse(s);
  if (kind === 'list') return s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  if (kind === 'text') return s;
  if (kind === 'bps') return Math.round(Number(s) * 100);
  const n = Number(s.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n)) throw new Error('Giá trị không hợp lệ');
  return n;
}

export default function SettingsPage() {
  const { run } = useRun();
  const { data, refetch } = useQuery({ queryKey: ['adm-settings'], queryFn: () => api<Record<string, any>>('/admin/system/settings') });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<null | { type: 'setting'; key: string; value: unknown; label: string } | { type: 'ks'; key: string; enabled: boolean; label: string } | { type: 'logout'; scope: 'users' | 'staff' }>(null);
  useEffect(() => {
    if (!data) return;
    const d: Record<string, string> = {};
    for (const g of GROUPS) for (const f of g.fields) d[f.key] = toText(f.kind, data[f.key]);
    setDraft(d);
  }, [data]);
  if (!data) return null;
  const ks = data.killSwitch ?? {};
  const anyOn = Object.values(ks).some(Boolean);

  const submit = async (reason: string) => {
    if (!pending) return;
    let ok = false;
    if (pending.type === 'setting') ok = await run('s', () => api(`/admin/system/settings/${encodeURIComponent(pending.key)}`, { method: 'PUT', body: { value: pending.value, reason } }), 'Đã lưu cấu hình');
    if (pending.type === 'ks') ok = await run('k', () => api('/admin/system/kill-switch', { body: { feature: pending.key, enabled: pending.enabled, reason } }), pending.enabled ? 'Đã BẬT công tắc khẩn cấp' : 'Đã tắt công tắc');
    if (pending.type === 'logout') ok = await run('l', async () => { const r = await api<{ revoked: number }>('/admin/system/logout-all', { body: { scope: pending.scope, reason } }); alert(`Đã thu hồi ${r.revoked} phiên đăng nhập`); });
    if (ok) {
      setPending(null);
      refetch();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Cấu hình & khẩn cấp" subtitle="Mọi thay đổi có hiệu lực ngay, bắt buộc nhập lý do và được ghi vào nhật ký kiểm toán." />

      <Card className={cn(anyOn && 'border-danger')}>
        <CardHeader title={<span className="flex items-center gap-2"><AlertOctagon className="h-5 w-5 text-danger" /> Công tắc khẩn cấp (kill switch)</span>} subtitle="Dùng khi phát hiện tấn công, lỗi thanh toán hoặc bảo trì." action={anyOn && <Badge tone="danger" dot>Đang có tính năng bị tạm dừng</Badge>} />
        <CardBody className="grid gap-2 pt-0 md:grid-cols-2">
          {KS.map((k) => (
            <div key={k.key} className={cn('flex items-start justify-between gap-3 rounded-xl border p-3', ks[k.key] ? 'border-danger bg-danger-soft' : 'border-border')}>
              <div>
                <p className="text-sm font-semibold">{k.label}</p>
                <p className="text-xs text-muted">{k.desc}</p>
              </div>
              <Switch checked={!!ks[k.key]} onChange={(v) => setPending({ type: 'ks', key: k.key, enabled: v, label: k.label })} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 md:col-span-2">
            <p className="flex-1 text-sm"><b>Đăng xuất hàng loạt</b> <span className="text-muted">– khi nghi lộ cookie / phiên đăng nhập.</span></p>
            <Button size="sm" variant="outline" onClick={() => setPending({ type: 'logout', scope: 'users' })}><LogOut className="h-4 w-4" /> Mọi người dùng</Button>
            <Button size="sm" variant="outline" onClick={() => setPending({ type: 'logout', scope: 'staff' })}><LogOut className="h-4 w-4" /> Mọi nhân sự khác</Button>
          </div>
        </CardBody>
      </Card>

      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader title={g.title} />
          <CardBody className="grid gap-4 pt-0 lg:grid-cols-2">
            {g.fields.map((f) => {
              const changed = draft[f.key] !== toText(f.kind, data[f.key]);
              return (
                <div key={f.key} className="space-y-1">
                  <label className="text-[13px] font-medium text-fg2" htmlFor={f.key}>{f.label}</label>
                  <div className="flex items-start gap-2">
                    {f.kind === 'json' || f.kind === 'text' ? (
                      <Textarea id={f.key} rows={f.kind === 'json' ? 6 : 2} className={cn(f.kind === 'json' && 'font-mono text-xs')} value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                    ) : (
                      <Input id={f.key} inputMode="decimal" value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                    )}
                    <Button
                      size="sm"
                      variant={changed ? 'primary' : 'outline'}
                      disabled={!changed}
                      onClick={() => {
                        try {
                          setPending({ type: 'setting', key: f.key, value: parse(f.kind, draft[f.key]), label: f.label });
                        } catch {
                          alert('Giá trị không hợp lệ (kiểm tra cú pháp JSON / số)');
                        }
                      }}
                      aria-label={`Lưu ${f.label}`}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    {f.kind === 'money' && `= ${vnd(Number(String(draft[f.key]).replace(/[^\d]/g, '')))} · `}
                    {f.kind === 'bps' && 'Đơn vị % · '}
                    {f.hint}
                    <code className="ml-1 text-[10px]">{f.key}</code>
                  </p>
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}

      <ReasonModal
        open={!!pending}
        onClose={() => setPending(null)}
        danger={pending?.type !== 'setting'}
        title={pending?.type === 'setting' ? `Lưu: ${pending.label}` : pending?.type === 'ks' ? `${pending.enabled ? 'BẬT' : 'Tắt'}: ${pending.label}` : pending?.type === 'logout' ? (pending.scope === 'users' ? 'Đăng xuất toàn bộ người dùng' : 'Đăng xuất mọi nhân sự khác') : ''}
        onSubmit={submit}
      >
        {pending?.type === 'setting' && <pre className="max-h-40 overflow-auto rounded-lg bg-subtle p-2 text-xs">{JSON.stringify(pending.value, null, 2)}</pre>}
      </ReasonModal>
    </div>
  );
}
