'use client';
import { useToast } from '@mmo/ui';
import { useState } from 'react';
import { errMsg } from './api';

/** Chạy thao tác + hiện toast thành công / lỗi. Trả về true nếu thành công. */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string): Promise<boolean> => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error('Không thực hiện được', errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { run, busy };
}
