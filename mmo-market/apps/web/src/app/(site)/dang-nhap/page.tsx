'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, useToast } from '@mmo/ui';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { api, errMsg } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  const done = async () => {
    await qc.invalidateQueries();
    const me = await api<{ user: { isStaff: boolean } | null }>('/auth/me').catch(() => null);
    if (me?.user?.isStaff) toast.info('Đây là tài khoản quản trị', `Trang quản trị nằm ở ${process.env.NEXT_PUBLIC_ADMIN_URL} (menu tài khoản → Trang quản trị).`);
    router.push(safeNext);
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!challenge) {
        const r = await api<{ ok?: boolean; mfaRequired?: boolean; challenge?: string }>('/auth/login', { body: { login, password } });
        if (r.mfaRequired) setChallenge(r.challenge!);
        else await done();
      } else {
        await api('/auth/login/mfa', { body: useRecovery ? { challenge, recoveryCode: code } : { challenge, code } });
        await done();
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={challenge ? 'Xác thực 2 lớp' : 'Đăng nhập'}
      subtitle={challenge ? 'Nhập mã 6 số trong ứng dụng xác thực của bạn.' : 'Chào mừng bạn quay lại MMO Market'}
      footer={
        !challenge && (
          <>
            Chưa có tài khoản? <Link href="/dang-ky" className="font-medium text-primary hover:underline">Đăng ký</Link>
            <span className="mt-2 block text-xs">
              Nhân sự quản trị? <a href={`${process.env.NEXT_PUBLIC_ADMIN_URL}/login`} className="text-primary hover:underline">Đăng nhập trang quản trị</a>
            </span>
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {!challenge ? (
          <>
            <Field label="Email hoặc tên đăng nhập">{(id) => <Input id={id} autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />}</Field>
            <Field label={<span className="flex justify-between">Mật khẩu <Link href="/quen-mat-khau" className="font-normal text-primary hover:underline">Quên mật khẩu?</Link></span>}>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-xl bg-primary-soft p-3 text-sm text-fg2">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> Tài khoản đã bật 2FA để bảo vệ số dư và đơn hàng của bạn.
            </div>
            <Field label={useRecovery ? 'Mã khôi phục' : 'Mã xác thực'}>
              {(id) => (
                <Input id={id} autoFocus inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'} className="text-center text-lg tracking-[0.3em]" />
              )}
            </Field>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setUseRecovery(!useRecovery); setCode(''); }}>
              {useRecovery ? 'Dùng mã từ ứng dụng xác thực' : 'Mất điện thoại? Dùng mã khôi phục'}
            </button>
          </>
        )}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {challenge ? 'Xác nhận' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
