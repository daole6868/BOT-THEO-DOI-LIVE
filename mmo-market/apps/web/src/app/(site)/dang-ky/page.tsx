'use client';
import { Button, Field, Input } from '@mmo/ui';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { api, ApiError, errMsg } from '@/lib/api';

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const s = strength(form.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    if (form.password !== form.confirm) return setFieldErr({ confirm: 'Mật khẩu nhập lại không khớp' });
    setBusy(true);
    try {
      await api('/auth/register', { body: { email: form.email, username: form.username, displayName: form.displayName, password: form.password } });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fieldErrors) {
        setFieldErr(Object.fromEntries(Object.entries(e.details.fieldErrors as Record<string, string[]>).map(([k, v]) => [k, v[0]])));
      } else setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <AuthCard title="Kiểm tra email của bạn">
        <div className="text-center">
          <MailCheck className="mx-auto h-14 w-14 text-primary" />
          <p className="mt-3 text-sm text-fg2">Nếu email hợp lệ, chúng tôi đã gửi liên kết xác minh tới <b>{form.email}</b>. Liên kết hết hạn sau 30 phút.</p>
          <p className="mt-2 text-xs text-muted">Môi trường dev: xem thư tại Mailpit http://localhost:8025 hoặc log của API.</p>
          <Link href="/dang-nhap"><Button className="mt-5">Đến trang đăng nhập</Button></Link>
        </div>
      </AuthCard>
    );

  return (
    <AuthCard title="Tạo tài khoản" subtitle="Miễn phí · Chỉ cần email" footer={<>Đã có tài khoản? <Link href="/dang-nhap" className="font-medium text-primary hover:underline">Đăng nhập</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" error={fieldErr.email} required>{(id) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={set('email')} required />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên đăng nhập" error={fieldErr.username} hint="3–24 ký tự a-z, 0-9, _ ." required>{(id) => <Input id={id} autoComplete="username" value={form.username} onChange={set('username')} required />}</Field>
          <Field label="Tên hiển thị" error={fieldErr.displayName} required>{(id) => <Input id={id} value={form.displayName} onChange={set('displayName')} required />}</Field>
        </div>
        <Field label="Mật khẩu" error={fieldErr.password} hint="Tối thiểu 10 ký tự. Nên dùng cụm từ dài, dễ nhớ." required>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />}
        </Field>
        {form.password && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < s ? (s <= 1 ? 'bg-danger' : s === 2 ? 'bg-warning' : 'bg-success') : 'bg-subtle'}`} />
              ))}
            </div>
            <span className="text-xs text-muted">{['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][s]}</span>
          </div>
        )}
        <Field label="Nhập lại mật khẩu" error={fieldErr.confirm} required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />}</Field>
        <label className="flex items-start gap-2 text-sm text-fg2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-[var(--primary)]" />
          <span>Tôi đồng ý với <Link href="/dieu-khoan" className="text-primary hover:underline">Điều khoản</Link>, <Link href="/quy-che" className="text-primary hover:underline">Quy chế sàn</Link> và <Link href="/chinh-sach-bao-mat" className="text-primary hover:underline">Chính sách bảo mật</Link>.</span>
        </label>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!agree}>Đăng ký</Button>
      </form>
    </AuthCard>
  );
}
