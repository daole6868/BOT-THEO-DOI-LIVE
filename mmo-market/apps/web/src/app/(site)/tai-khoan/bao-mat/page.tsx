'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader, TD, TH, Table, dateTime, timeAgo, useToast } from '@mmo/ui';
import { KeyRound, LogOut, MonitorSmartphone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { MfaSetup } from '@/components/MfaSetup';
import { api, errMsg } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export default function SecurityPage() {
  const { data } = useMe();
  const u = data?.user;
  const qc = useQueryClient();
  const toast = useToast();
  const [mfaOpen, setMfaOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [pin, setPin] = useState({ pin: '', confirm: '', password: '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [dis, setDis] = useState({ code: '', password: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<any[]>('/auth/sessions') });
  const history = useQuery({ queryKey: ['login-history'], queryFn: () => api<any[]>('/auth/login-history') });
  if (!u) return null;

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      return true;
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Bảo mật tài khoản" subtitle="Bảo vệ số dư và đơn hàng của bạn bằng nhiều lớp." />
      {!u.mfaEnabled && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning-soft p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-warning" />
          <div className="flex-1">
            <p className="font-semibold text-fg">Bạn chưa bật xác thực 2 lớp</p>
            <p className="text-fg2">Người bán bắt buộc bật 2FA. Người mua nên bật để chống mất tài khoản khi lộ mật khẩu.</p>
          </div>
          <Button onClick={() => setMfaOpen(true)}>Bật ngay</Button>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Xác thực 2 lớp (TOTP)</span>} action={u.mfaEnabled ? <Badge tone="success" dot>Đang bật</Badge> : <Badge tone="warning" dot>Chưa bật</Badge>} />
          <CardBody className="space-y-3 text-sm text-fg2">
            <p>Mỗi lần đăng nhập và khi rút tiền/đổi ngân hàng sẽ cần mã 6 số từ ứng dụng xác thực.</p>
            {u.mfaEnabled ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const code = prompt('Nhập mã 2FA hiện tại để tạo bộ mã khôi phục mới:');
                    if (!code) return;
                    try {
                      const r = await api<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', { body: { code } });
                      alert(`Mã khôi phục mới (hãy lưu lại):\n\n${r.recoveryCodes.join('\n')}`);
                    } catch (e) {
                      toast.error('Lỗi', errMsg(e));
                    }
                  }}
                >
                  Tạo mã khôi phục mới
                </Button>
                {!u.store && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDisableOpen(true)}>Tắt 2FA</Button>}
              </div>
            ) : (
              <Button onClick={() => setMfaOpen(true)}>Bật 2FA</Button>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Mã PIN giao dịch</span>} action={u.hasPin ? <Badge tone="success" dot>Đã đặt</Badge> : <Badge dot>Chưa đặt</Badge>} />
          <CardBody className="space-y-3 text-sm text-fg2">
            <p>PIN 6 số dùng thêm khi rút tiền và thêm tài khoản ngân hàng. Không trùng mật khẩu, không dùng 123456.</p>
            <Button variant="outline" disabled={!u.mfaEnabled} onClick={() => setPinOpen(true)} title={!u.mfaEnabled ? 'Cần bật 2FA trước' : undefined}>
              {u.hasPin ? 'Đổi PIN' : 'Đặt PIN'}
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Đổi mật khẩu" subtitle="Sau khi đổi, các thiết bị khác bị đăng xuất và rút tiền tạm khoá 24 giờ." />
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw.next !== pw.confirm) return toast.error('Mật khẩu nhập lại không khớp');
              if (await run('pw', () => api('/auth/password/change', { body: { currentPassword: pw.current, newPassword: pw.next } }), 'Đã đổi mật khẩu')) setPw({ current: '', next: '', confirm: '' });
            }}
          >
            <Input type="password" placeholder="Mật khẩu hiện tại" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <Input type="password" placeholder="Mật khẩu mới (≥ 10 ký tự)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <div className="flex gap-2">
              <Input type="password" placeholder="Nhập lại" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              <Button type="submit" loading={busy === 'pw'} disabled={!pw.current || !pw.next}>Đổi</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-primary" /> Thiết bị đang đăng nhập</span>}
          action={<Button variant="outline" size="sm" loading={busy === 'revoke'} onClick={() => run('revoke', () => api('/auth/sessions/revoke-others', { method: 'POST' }), 'Đã đăng xuất các thiết bị khác')}><LogOut className="h-4 w-4" /> Đăng xuất thiết bị khác</Button>}
        />
        <Table>
          <thead><tr><TH>Thiết bị</TH><TH>IP</TH><TH>Hoạt động</TH><TH /></tr></thead>
          <tbody>
            {sessions.data?.map((s) => (
              <tr key={s.id}>
                <TD className="max-w-xs truncate text-fg2" >{s.userAgent?.slice(0, 80) ?? 'Không rõ'} {s.current && <Badge tone="primary">Thiết bị này</Badge>}</TD>
                <TD className="font-mono text-xs">{s.ip}</TD>
                <TD className="text-muted">{timeAgo(s.lastSeenAt)}</TD>
                <TD align="right">{!s.current && <Button size="sm" variant="ghost" className="text-danger" onClick={() => run('s' + s.id, () => api(`/auth/sessions/${s.id}`, { method: 'DELETE' }), 'Đã đăng xuất thiết bị')}>Đăng xuất</Button>}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Lịch sử đăng nhập" subtitle="30 lần gần nhất. Thấy IP lạ? Đổi mật khẩu ngay." />
        <Table>
          <thead><tr><TH>Thời gian</TH><TH>IP</TH><TH>Kết quả</TH></tr></thead>
          <tbody>
            {history.data?.map((h, i) => (
              <tr key={i}>
                <TD className="text-muted">{dateTime(h.createdAt)}</TD>
                <TD className="font-mono text-xs">{h.ip}</TD>
                <TD>{h.result === 'success' ? <Badge tone="success">Thành công</Badge> : <Badge tone="danger">{h.result === 'bad_password' ? 'Sai mật khẩu' : h.result === 'mfa_failed' ? 'Sai mã 2FA' : h.result}</Badge>}</TD>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <MfaSetup open={mfaOpen} onClose={() => setMfaOpen(false)} />
      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="Đặt mã PIN giao dịch" size="sm">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pin.pin !== pin.confirm) return toast.error('PIN nhập lại không khớp');
            if (await run('pin', () => api('/auth/pin', { body: { pin: pin.pin, password: pin.password } }), 'Đã đặt PIN')) {
              setPinOpen(false);
              setPin({ pin: '', confirm: '', password: '' });
            }
          }}
        >
          <Field label="PIN mới (6 số)">{(id) => <Input id={id} type="password" inputMode="numeric" maxLength={6} value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Nhập lại PIN">{(id) => <Input id={id} type="password" inputMode="numeric" maxLength={6} value={pin.confirm} onChange={(e) => setPin({ ...pin, confirm: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Mật khẩu tài khoản">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pin.password} onChange={(e) => setPin({ ...pin, password: e.target.value })} />}</Field>
          <Button type="submit" className="w-full" loading={busy === 'pin'} disabled={pin.pin.length !== 6}>Lưu PIN</Button>
        </form>
      </Modal>
      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Tắt 2FA" size="sm">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run('dis', () => api('/auth/mfa/disable', { body: dis }), 'Đã tắt 2FA')) setDisableOpen(false); }}>
          <p className="rounded-lg bg-danger-soft p-2.5 text-xs text-danger">Tắt 2FA làm tài khoản kém an toàn và khoá rút tiền 48 giờ.</p>
          <Field label="Mã 2FA">{(id) => <Input id={id} inputMode="numeric" maxLength={6} value={dis.code} onChange={(e) => setDis({ ...dis, code: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Mật khẩu">{(id) => <Input id={id} type="password" value={dis.password} onChange={(e) => setDis({ ...dis, password: e.target.value })} />}</Field>
          <Button type="submit" variant="danger" className="w-full" loading={busy === 'dis'}>Tắt 2FA</Button>
        </form>
      </Modal>
    </div>
  );
}
