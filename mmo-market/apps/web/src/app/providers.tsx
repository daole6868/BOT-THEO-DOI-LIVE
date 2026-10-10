'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Modal, ToastProvider, useToast } from '@mmo/ui';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, errMsg, registerStepUp } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { getSocket, resetSocket } from '@/lib/socket';

/** Hộp thoại xác thực lại 2FA dùng chung cho mọi thao tác nhạy cảm (rút tiền, đổi ngân hàng...). */
function StepUpProvider() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerStepUp(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setCode('');
          setError(null);
          setOpen(true);
        }),
    );
    return () => registerStepUp(null);
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/step-up', { body: { code }, noStepUp: true });
      close(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => close(false)} title="Xác thực lại bằng 2FA" size="sm">
      <div className="mb-4 flex items-start gap-3 rounded-xl bg-primary-soft p-3 text-sm text-fg2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        Thao tác này cần xác minh lại danh tính. Nhập mã 6 số trong ứng dụng Google Authenticator / Authy.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <Field label="Mã xác thực" error={error}>
          {(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="text-center text-lg tracking-[0.4em]" />}
        </Field>
        <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
          Xác nhận
        </Button>
      </form>
    </Modal>
  );
}

/** Nhận sự kiện realtime: thông báo, số dư, nạp tiền, đơn hàng. */
function RealtimeBridge() {
  const { data } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const userId = data?.user?.id;
  useEffect(() => {
    if (!userId) {
      resetSocket();
      return;
    }
    const s = getSocket();
    const onNotif = (n: { title: string; body?: string }) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.setQueryData(['me'], (old: any) => (old ? { ...old, unreadNotifications: (old.unreadNotifications ?? 0) + 1 } : old));
      toast.info(n.title, n.body);
    };
    const onWallet = (w: any) => qc.setQueryData(['wallet'], w);
    const onOrder = () => qc.invalidateQueries({ queryKey: ['orders'] });
    const onMsg = () => {
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    };
    s.on('notification:new', onNotif);
    s.on('wallet:updated', onWallet);
    s.on('order:updated', onOrder);
    s.on('order:new', onOrder);
    s.on('message:new', onMsg);
    return () => {
      s.off('notification:new', onNotif);
      s.off('wallet:updated', onWallet);
      s.off('order:updated', onOrder);
      s.off('order:new', onOrder);
      s.off('message:new', onMsg);
    };
  }, [userId, qc, toast]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <StepUpProvider />
        <RealtimeBridge />
      </ToastProvider>
    </QueryClientProvider>
  );
}
