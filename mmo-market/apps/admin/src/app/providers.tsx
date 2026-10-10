'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast, vnd } from '@mmo/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { useStaff } from '@/lib/hooks';
import { getSocket, resetSocket } from '@/lib/socket';

/** Sự kiện realtime cho nhân sự: hàng đợi mới, tin nhắn hỗ trợ, lệnh rút... */
function StaffRealtime() {
  const { data } = useStaff();
  const qc = useQueryClient();
  const toast = useToast();
  const id = data?.user?.id;
  useEffect(() => {
    if (!id) {
      resetSocket();
      return;
    }
    const s = getSocket();
    const refreshQueues = () => qc.invalidateQueries({ queryKey: ['queues'] });
    const handlers: Record<string, (p: any) => void> = {
      'support:queued': (p) => {
        toast.info('Yêu cầu hỗ trợ mới', p?.topic ?? p?.preview);
        qc.invalidateQueries({ queryKey: ['support-queue'] });
        refreshQueues();
      },
      'support:message': () => qc.invalidateQueries({ queryKey: ['support-queue'] }),
      'support:assigned': () => qc.invalidateQueries({ queryKey: ['support-queue'] }),
      'support:resolved': () => qc.invalidateQueries({ queryKey: ['support-queue'] }),
      'message:new': (p) => qc.invalidateQueries({ queryKey: ['support-msgs', p?.conversationId] }),
      'withdrawal:new': (p) => {
        toast.info('Lệnh rút mới', p?.amount ? `${p.code} · ${vnd(p.amount)}` : p?.code);
        qc.invalidateQueries({ queryKey: ['adm-withdrawals'] });
        refreshQueues();
      },
      'dispute:escalated': () => {
        toast.warning('Khiếu nại được chuyển lên admin');
        qc.invalidateQueries({ queryKey: ['adm-disputes'] });
        refreshQueues();
      },
      'report:new': () => refreshQueues(),
      'post:pending': () => refreshQueues(),
      'adjustment:new': () => {
        toast.info('Có yêu cầu điều chỉnh số dư cần duyệt');
        refreshQueues();
      },
    };
    for (const [e, h] of Object.entries(handlers)) s.on(e, h);
    return () => {
      for (const [e, h] of Object.entries(handlers)) s.off(e, h);
    };
  }, [id, qc, toast]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        {children}
        <StaffRealtime />
      </ToastProvider>
    </QueryClientProvider>
  );
}
