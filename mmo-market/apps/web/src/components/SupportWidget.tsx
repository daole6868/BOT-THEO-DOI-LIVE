'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Select, Textarea, useToast } from '@mmo/ui';
import { Headset, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';
import { useMe } from '@/lib/hooks';

/** Nút hỗ trợ nổi: chọn chủ đề -> vào hàng chờ hỗ trợ viên (hoặc tạo yêu cầu ngoài giờ). */
export function SupportWidget() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('order');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { data } = useQuery({ queryKey: ['support-topics'], queryFn: () => api<{ topics: { value: string; label: string }[]; staffOnline: number }>('/chat/support/topics'), enabled: open && !!me?.user });

  if (!me?.user) return null;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string; offlineNotice: string | null }>('/chat/support', { body: { topic, message: msg } });
      if (r.offlineNotice) toast.info('Đã gửi yêu cầu hỗ trợ', r.offlineNotice);
      setOpen(false);
      setMsg('');
      router.push(`/tai-khoan/tin-nhan?c=${r.id}`);
    } catch (e) {
      toast.error('Không gửi được', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed bottom-5 right-5 z-30">
      {open && (
        <div className="mb-3 w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold">Hỗ trợ khách hàng</p>
              <p className="text-xs text-muted">
                {data ? (data.staffOnline > 0 ? <span className="text-success">● {data.staffOnline} hỗ trợ viên đang trực tuyến</span> : 'Ngoài giờ trực – chúng tôi sẽ phản hồi sớm') : '…'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-subtle" aria-label="Đóng">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-3">
            <Field label="Chủ đề">
              {(id) => (
                <Select id={id} value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {data?.topics.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Bạn cần hỗ trợ gì?">{(id) => <Textarea id={id} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Mô tả ngắn vấn đề, kèm mã đơn/mã nạp nếu có" maxLength={2000} />}</Field>
            <p className="rounded-lg bg-warning-soft p-2 text-[11px] text-warning">Nhân viên không bao giờ hỏi mật khẩu, mã 2FA hay yêu cầu chuyển khoản riêng.</p>
            <Button className="w-full" loading={busy} disabled={msg.trim().length < 5} onClick={submit}>
              Bắt đầu trò chuyện
            </Button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-xl hover:bg-primary-hover" aria-label="Hỗ trợ">
        <Headset className="h-6 w-6" />
      </button>
    </div>
  );
}
