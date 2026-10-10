'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CopyButton, Field, Input } from '@mmo/ui';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';

type Step = { kind: 'password' } | { kind: 'mfa'; challenge: string } | { kind: 'setup'; challenge: string; qr: string; secret: string } | { kind: 'recovery'; codes: string[] };

export default function AdminLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [form, setForm] = useState({ login: '', password: '' });
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-me'] });
    router.replace('/');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step.kind === 'password') {
        const r = await api<any>('/admin/auth/login', { body: form });
        if (r.mfaSetupRequired) setStep({ kind: 'setup', challenge: r.challenge, qr: r.qr, secret: r.secret });
        else if (r.mfaRequired) setStep({ kind: 'mfa', challenge: r.challenge });
        else await done();
      } else if (step.kind === 'mfa' || step.kind === 'setup') {
        const r = await api<any>('/admin/auth/mfa', { body: { challenge: step.challenge, ...(useRecovery ? { recoveryCode: code.trim() } : { code }) } });
        if (r.recoveryCodes?.length) setStep({ kind: 'recovery', codes: r.recoveryCodes });
        else await done();
      }
    } catch (err) {
      setError(errMsg(err));
      if (step.kind !== 'password' && /hết hạn|expired|không hợp lệ/i.test(errMsg(err)) && /phiên|challenge/i.test(errMsg(err))) setStep({ kind: 'password' });
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={36} height={36} />
          <div>
            <p className="font-bold leading-tight">MMO Market</p>
            <p className="text-xs text-muted">Khu vực quản trị · chỉ dành cho nhân sự</p>
          </div>
        </div>
        {step.kind === 'recovery' ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Mã khôi phục 2FA</p>
            <p className="text-sm text-fg2">Lưu 10 mã này ở nơi an toàn (mỗi mã dùng 1 lần) để đăng nhập khi mất điện thoại. Mã chỉ hiển thị một lần.</p>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-subtle p-3 font-mono text-sm">{step.codes.map((c) => <span key={c}>{c}</span>)}</div>
            <CopyButton text={step.codes.join('\n')} label="Sao chép tất cả" />
            <Button className="w-full" onClick={done}>Tôi đã lưu, vào trang quản trị</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {step.kind === 'password' && (
              <>
                <Field label="Email hoặc tên đăng nhập">{(id) => <Input id={id} autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />}</Field>
                <Field label="Mật khẩu">{(id) => <Input id={id} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}</Field>
              </>
            )}
            {step.kind === 'setup' && (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-fg2"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /> Nhân sự bắt buộc bật xác thực 2 lớp. Quét mã QR bằng Google Authenticator / Authy.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.qr} alt="Mã QR 2FA" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
                <p className="text-center text-xs text-muted">Hoặc nhập khoá: <code className="break-all font-mono text-fg">{step.secret}</code></p>
              </div>
            )}
            {(step.kind === 'mfa' || step.kind === 'setup') && (
              <>
                {useRecovery ? (
                  <Field label="Mã khôi phục">{(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" autoFocus />}</Field>
                ) : (
                  <Field label="Mã 6 số trong ứng dụng xác thực">
                    {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.4em]" autoFocus />}
                  </Field>
                )}
                {step.kind === 'mfa' && (
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); }}>
                    {useRecovery ? 'Dùng mã từ ứng dụng' : 'Mất điện thoại? Dùng mã khôi phục'}
                  </button>
                )}
              </>
            )}
            {error && <p className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger" role="alert">{error}</p>}
            <Button type="submit" className="w-full" loading={busy} disabled={step.kind !== 'password' && !useRecovery && code.length !== 6}>
              {step.kind === 'password' ? 'Đăng nhập' : step.kind === 'setup' ? 'Kích hoạt 2FA & đăng nhập' : 'Xác nhận'}
            </Button>
            {step.kind !== 'password' && (
              <button type="button" className="w-full text-center text-xs text-muted hover:text-fg" onClick={() => { setStep({ kind: 'password' }); setError(null); }}>
                ← Quay lại
              </button>
            )}
          </form>
        )}
        <p className="mt-5 text-center text-[11px] text-muted">Mọi thao tác đều được ghi nhật ký kiểm toán chống sửa đổi.</p>
      </Card>
    </main>
  );
}
