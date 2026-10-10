'use client';
import { Button, Field, Modal, Textarea } from '@mmo/ui';
import { useEffect, useState, type ReactNode } from 'react';

/** Hộp thoại bắt buộc nhập lý do – mọi thao tác nhạy cảm của admin đều ghi lý do vào nhật ký. */
export function ReasonModal({
  open, onClose, title, onSubmit, label = 'Lý do (ghi vào nhật ký kiểm toán)', min = 5, danger, confirmText = 'Xác nhận', children, optional,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (reason: string) => Promise<unknown>;
  label?: string;
  min?: number;
  danger?: boolean;
  confirmText?: string;
  children?: ReactNode;
  optional?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const ok = optional || reason.trim().length >= min;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {children}
        <Field label={label} hint={optional ? 'Không bắt buộc' : `Tối thiểu ${min} ký tự`}>
          {(id) => <Textarea id={id} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />}
        </Field>
      </div>
    </Modal>
  );
}
