'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Countdown, CopyButton, Field, Input, Modal, useToast, vnd } from '@mmo/ui';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errMsg, uuid } from '@/lib/api';
import { getSocket } from '@/lib/socket';

const PRESETS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

interface DepositView {
  code: string;
  amount: number;
  status: string;
  expiresAt: string;
  transferContent: string;
  bank: { bin: string; name: string; accountNo: string; accountName: string };
  qr: string | null;
}

/** Nạp tiền: sinh mã VietQR có nội dung duy nhất, tự xác nhận qua webhook ngân hàng (realtime). */
export function DepositModal({ open, onClose, suggest }: { open: boolean; onClose: () => void; suggest?: number }) {
  const [amount, setAmount] = useState<number>(suggest ?? 200_000);
  const [dep, setDep] = useState<DepositView | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setDep(null);
      setDone(false);
      if (suggest) setAmount(Math.max(10_000, Math.ceil(suggest / 10_000) * 10_000));
    }
  }, [open, suggest]);

  useEffect(() => {
    if (!dep) return;
    const s = getSocket();
    const onDone = (e: { code: string }) => {
      if (e.code === dep.code) {
        setDone(true);
        qc.invalidateQueries({ queryKey: ['wallet'] });
        toast.success('Nạp tiền thành công', vnd(dep.amount));
      }
    };
    s.on('deposit:completed', onDone);
    // Dự phòng khi mất kết nối realtime: hỏi lại mỗi 8 giây
    const t = setInterval(async () => {
      try {
        const d = await api<DepositView>(`/wallet/deposits/${dep.code}`);
        if (d.status === 'COMPLETED') onDone({ code: d.code });
      } catch {
        /* bỏ qua */
      }
    }, 8000);
    return () => {
      s.off('deposit:completed', onDone);
      clearInterval(t);
    };
  }, [dep, qc, toast]);

  const create = async () => {
    setBusy(true);
    try {
      setDep(await api<DepositView>('/wallet/deposits', { body: { amount }, idem: uuid() }));
    } catch (e) {
      toast.error('Không tạo được yêu cầu nạp', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    if (!dep) return;
    await api(`/dev/deposits/${dep.code}/simulate-paid`, { method: 'POST' }).catch((e) => toast.error('Lỗi', errMsg(e)));
  };

  return (
    <Modal open={open} onClose={onClose} title="Nạp tiền vào ví" size="md">
      {!dep ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(p)} className={`rounded-lg border px-2 py-2.5 text-sm font-semibold tabular ${amount === p ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:border-primary/50'}`}>
                {vnd(p)}
              </button>
            ))}
          </div>
          <Field label="Hoặc nhập số tiền" hint="Tối thiểu 10.000 ₫">
            {(id) => <Input id={id} inputMode="numeric" value={amount ? amount.toLocaleString('vi-VN') : ''} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} />}
          </Field>
          <Button className="w-full" size="lg" loading={busy} disabled={amount < 10_000} onClick={create}>
            Tạo mã QR nạp {vnd(amount)}
          </Button>
        </div>
      ) : done ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          <p className="mt-3 text-lg font-semibold">Đã nhận {vnd(dep.amount)}</p>
          <p className="text-sm text-muted">Số dư đã được cập nhật.</p>
          <Button className="mt-5" onClick={onClose}>
            Xong
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {dep.qr && <img src={dep.qr} alt="Mã VietQR" className="h-48 w-48 rounded-xl border border-border bg-white p-2" />}
            <dl className="w-full space-y-2 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted">Ngân hàng</dt><dd className="font-medium">{dep.bank.name}</dd></div>
              <div className="flex items-center justify-between gap-2"><dt className="text-muted">Số tài khoản</dt><dd className="flex items-center font-medium tabular">{dep.bank.accountNo}<CopyButton text={dep.bank.accountNo} label="" /></dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Chủ tài khoản</dt><dd className="text-right font-medium">{dep.bank.accountName}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Số tiền</dt><dd className="font-bold text-primary tabular">{vnd(dep.amount)}</dd></div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-warning-soft px-2 py-1.5"><dt className="font-medium text-warning">Nội dung CK</dt><dd className="flex items-center font-bold tabular">{dep.transferContent}<CopyButton text={dep.transferContent} label="" /></dd></div>
            </dl>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-subtle p-3 text-xs text-fg2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              Chuyển <b>đúng nội dung</b> để được cộng tiền tự động trong vài giây. Mã hết hạn sau <Countdown to={dep.expiresAt} className="font-semibold" />. Sàn chỉ nhận tiền qua tài khoản hiển thị ở đây.
            </span>
          </div>
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Đang chờ ngân hàng xác nhận…
          </p>
          {process.env.NEXT_PUBLIC_DEV_TOOLS === 'true' && (
            <Button variant="outline" className="w-full" onClick={simulate}>
              🧪 Giả lập đã chuyển khoản (chỉ môi trường dev)
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
