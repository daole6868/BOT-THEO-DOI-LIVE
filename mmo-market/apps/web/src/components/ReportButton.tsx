'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Modal, Select, Textarea, useToast } from '@mmo/ui';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { api, errMsg } from '@/lib/api';
import { useMe } from '@/lib/hooks';

export function ReportButton({ targetType, targetId, compact }: { targetType: string; targetId: string; compact?: boolean }) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('SCAM');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { data: reasons } = useQuery({ queryKey: ['report-reasons'], queryFn: () => api<{ value: string; label: string }[]>('/reports/reasons'), enabled: open });
  if (!me?.user) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await api('/reports', { body: { targetType, targetId, reason, detail: detail || undefined } });
      toast.success('Đã gửi báo cáo', 'Cảm ơn bạn, đội kiểm duyệt sẽ xem xét sớm.');
      setOpen(false);
    } catch (e) {
      toast.error('Không gửi được báo cáo', errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger">
        <Flag className="h-3.5 w-3.5" /> {!compact && 'Báo cáo'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Báo cáo vi phạm" size="sm" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button><Button variant="danger" loading={busy} onClick={submit}>Gửi báo cáo</Button></>}>
        <div className="space-y-3">
          <Field label="Lý do">
            {(id) => (
              <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons?.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Chi tiết (không bắt buộc)">{(id) => <Textarea id={id} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} />}</Field>
        </div>
      </Modal>
    </>
  );
}
