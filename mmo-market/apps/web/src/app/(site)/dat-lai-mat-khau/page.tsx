'use client';
import { Button, Field, Input } from '@mmo/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { api, errMsg } from '@/lib/api';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthCard title="Đặt lại mật khẩu">
      {done ? (
        <div className="text-center">
          <p className="rounded-xl bg-success-soft p-4 text-sm text-success">Đã đổi mật khẩu. Mọi thiết bị đã bị đăng xuất.</p>
          <Link href="/dang-nhap"><Button className="mt-4">Đăng nhập</Button></Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw !== pw2) return setError('Mật khẩu nhập lại không khớp');
            setBusy(true);
            setError(null);
            try {
              await api('/auth/password/reset', { body: { token, password: pw } });
              setDone(true);
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Mật khẩu mới" hint="Tối thiểu 10 ký tự">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />}</Field>
          <Field label="Nhập lại" error={error}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />}</Field>
          <Button type="submit" className="w-full" loading={busy}>Đổi mật khẩu</Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
