'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@mmo/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { api, errMsg } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const qc = useQueryClient();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api('/auth/verify-email', { body: { token } })
      .then(() => {
        setState('ok');
        qc.invalidateQueries({ queryKey: ['me'] });
      })
      .catch((e) => {
        setState('error');
        setMsg(errMsg(e));
      });
  }, [token, qc]);
  return (
    <AuthCard title="Xác minh email">
      <div className="py-4 text-center">
        {state === 'loading' && <Spinner className="h-8 w-8" />}
        {state === 'ok' && (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <p className="mt-3 font-medium">Email đã được xác minh!</p>
            <Link href="/tai-khoan/bao-mat"><Button className="mt-4">Bật bảo mật 2 lớp ngay</Button></Link>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="mx-auto h-14 w-14 text-danger" />
            <p className="mt-3 text-sm text-fg2">{msg}</p>
            <Link href="/dang-nhap"><Button variant="outline" className="mt-4">Đăng nhập để gửi lại</Button></Link>
          </>
        )}
      </div>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
