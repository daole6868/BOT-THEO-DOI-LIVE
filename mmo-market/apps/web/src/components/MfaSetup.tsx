'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, CopyButton, Field, Input, Modal, useToast } from '@mmo/ui';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';

/** Quy trình bật 2FA: xác nhận mật khẩu -> quét QR -> nhập mã -> lưu mã khôi phục. */
export function MfaSetup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'password' | 'scan' | 'codes'>('password');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const reset = () => {
    setStep('password');
    setPassword('');
    setSetup(null);
    setCode('');
    setCodes([]);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={close} title="Bật xác thực 2 lớp (2FA)" dismissable={step !== 'codes'}>
      {step === 'password' && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(async () => { setSetup(await api('/auth/mfa/setup', { body: { password } })); setStep('scan'); }); }}>
          <p className="text-sm text-fg2">Nhập mật khẩu hiện tại để bắt đầu. Bạn cần ứng dụng Google Authenticator, Authy hoặc Microsoft Authenticator trên điện thoại.</p>
          <Field label="Mật khẩu" error={error}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Button type="submit" className="w-full" loading={busy}>Tiếp tục</Button>
        </form>
      )}
      {step === 'scan' && setup && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await api<{ recoveryCodes: string[] }>('/auth/mfa/enable', { body: { code } }); setCodes(r.recoveryCodes); setStep('codes'); qc.invalidateQueries({ queryKey: ['me'] }); }); }}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fg2">
            <li>Mở ứng dụng xác thực, chọn “Thêm tài khoản” → quét mã QR.</li>
            <li>Nhập mã 6 số đang hiển thị để xác nhận.</li>
          </ol>
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="Mã QR 2FA" className="h-48 w-48 rounded-xl border border-border bg-white p-2" />
            <p className="text-xs text-muted">Không quét được? Nhập khoá: <code className="font-mono text-fg">{setup.secret}</code> <CopyButton text={setup.secret} label="" /></p>
          </div>
          <Field label="Mã xác thực" error={error}>{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center text-lg tracking-[0.4em]" placeholder="123456" />}</Field>
          <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>Kích hoạt 2FA</Button>
        </form>
      )}
      {step === 'codes' && (
        <div className="space-y-4">
          <p className="rounded-xl bg-success-soft p-3 text-sm text-success">Đã bật 2FA! Hãy lưu 10 mã khôi phục dưới đây ở nơi an toàn. Mỗi mã dùng được 1 lần khi bạn mất điện thoại.</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-subtle p-3 font-mono text-sm">
            {codes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="flex gap-2">
            <CopyButton text={codes.join('\n')} label="Sao chép" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([`Mã khôi phục 2FA MMO Market\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
                a.download = 'mmo-market-ma-khoi-phuc.txt';
                a.click();
              }}
            >
              <Download className="h-4 w-4" /> Tải về
            </Button>
          </div>
          <Button className="w-full" onClick={() => { toast.success('Tài khoản của bạn đã an toàn hơn'); close(); }}>Tôi đã lưu mã khôi phục</Button>
        </div>
      )}
    </Modal>
  );
}
