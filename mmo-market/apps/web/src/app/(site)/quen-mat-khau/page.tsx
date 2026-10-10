'use client';
import { Button, Field, Input } from '@mmo/ui';
import Link from 'next/link';
import { useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { api, errMsg } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthCard title="Quên mật khẩu" subtitle="Nhập email để nhận liên kết đặt lại mật khẩu." footer={<Link href="/dang-nhap" className="text-primary hover:underline">Quay lại đăng nhập</Link>}>
      {sent ? (
        <p className="rounded-xl bg-success-soft p-4 text-sm text-success">Nếu email tồn tại, liên kết đặt lại đã được gửi. Liên kết hết hạn sau 15 phút. Sau khi đặt lại, rút tiền sẽ tạm khoá 24 giờ để bảo vệ bạn.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/auth/password/forgot', { body: { email } });
              setSent(true);
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email" error={error}>{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
          <Button type="submit" className="w-full" loading={busy}>Gửi liên kết</Button>
        </form>
      )}
    </AuthCard>
  );
}
