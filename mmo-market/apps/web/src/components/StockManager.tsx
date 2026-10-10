'use client';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Pagination, TD, TH, Table, Tabs, Textarea, dateTime, num, useToast } from '@mmo/ui';
import { CheckCircle2, FileUp, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, errMsg } from '@/lib/api';

interface ImportResult {
  totalLines: number;
  accepted: number;
  duplicatesInBatch: number;
  duplicatesExisting: number;
  invalidCount: number;
  invalid: { line: number; reason: string }[];
  preview: string[];
  saved: boolean;
}

/** Nhập kho hàng số: kiểm tra trùng (trong lô / toàn sàn) trước khi lưu, dữ liệu mã hoá ngay tại server. */
export function StockManager({ productId, format, onChanged }: { productId: string; format?: string | null; onChanged?: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('AVAILABLE');
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const list = useQuery({ queryKey: ['stock', productId, status, page], queryFn: () => api<any>(`/seller/products/${productId}/stock?status=${status}&page=${page}`) });
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? 'check' : 'save');
    try {
      const r = await api<ImportResult>(`/seller/products/${productId}/stock`, { body: { lines: text, dryRun } });
      setResult(r);
      if (!dryRun && r.saved) {
        toast.success(`Đã thêm ${num(r.accepted)} item vào kho`);
        setText('');
        list.refetch();
        onChanged?.();
      }
    } catch (e) {
      toast.error('Không nhập được kho', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error('File tối đa 5MB');
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setResult(null);
    };
    reader.readAsText(f, 'utf-8');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Nhập kho" subtitle={`Mỗi dòng 1 item${format ? ` · định dạng: ${format}` : ''} · tối đa 50.000 dòng/lần`} />
        <CardBody className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            rows={8}
            className="font-mono text-xs"
            placeholder={format ? `${format}\n${format}` : 'Dán dữ liệu, mỗi dòng một item…'}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Tải file .txt / .csv</Button>
            <input ref={fileRef} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="text-xs text-muted">{num(lines)} dòng</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 text-success" /> Mã hoá AES-256 khi lưu</span>
          </div>
          {result && (
            <div className="rounded-xl border border-border p-3">
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" /> Hợp lệ: <b>{num(result.accepted)}</b></span>
                <span className="text-warning">Trùng trong lô: <b>{num(result.duplicatesInBatch)}</b></span>
                <span className="text-danger">Đã có trên sàn/đã bán: <b>{num(result.duplicatesExisting)}</b></span>
                <span className="flex items-center gap-1.5 text-danger"><XCircle className="h-4 w-4" /> Lỗi: <b>{num(result.invalidCount)}</b></span>
              </div>
              {result.preview.length > 0 && <p className="mt-2 text-xs text-muted">Xem trước (đã che): {result.preview.join(' · ')}</p>}
              {result.invalid.length > 0 && <p className="mt-1 text-xs text-danger">Dòng lỗi: {result.invalid.slice(0, 10).map((i) => `#${i.line} (${i.reason})`).join(', ')}</p>}
              {result.saved && <p className="mt-2 text-sm font-medium text-success">✔ Đã lưu vào kho</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" loading={busy === 'check'} disabled={!lines} onClick={() => run(true)}>Kiểm tra trước</Button>
            <Button loading={busy === 'save'} disabled={!lines || (result != null && !result.saved && result.accepted === 0)} onClick={() => run(false)}>Lưu {result && !result.saved ? num(result.accepted) : ''} item vào kho</Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} className="px-3" items={[{ value: 'AVAILABLE', label: 'Còn hàng' }, { value: 'SOLD', label: 'Đã bán' }, { value: 'REVOKED', label: 'Đã thu hồi' }]} />
        <Table>
          <thead><tr><TH>Item (đã che)</TH><TH>Trạng thái</TH><TH>Thời gian</TH><TH /></tr></thead>
          <tbody>
            {list.data?.items.map((it: any) => (
              <tr key={it.id}>
                <TD className="font-mono text-xs">{it.preview}</TD>
                <TD><Badge tone={it.status === 'AVAILABLE' ? 'success' : it.status === 'SOLD' ? 'primary' : 'neutral'}>{it.status === 'AVAILABLE' ? 'Còn' : it.status === 'SOLD' ? 'Đã bán' : 'Thu hồi'}</Badge></TD>
                <TD className="text-muted">{dateTime(it.soldAt ?? it.createdAt)}</TD>
                <TD align="right">
                  {it.status === 'AVAILABLE' && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (!confirm('Thu hồi item này khỏi kho?')) return; await api(`/seller/stock/${it.id}`, { method: 'DELETE' }).then(() => { list.refetch(); onChanged?.(); }).catch((e) => toast.error('Lỗi', errMsg(e))); }} aria-label="Thu hồi">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TD>
              </tr>
            ))}
          </tbody>
        </Table>
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}
        {list.data?.batches?.length > 0 && (
          <div className="border-t border-border p-4">
            <p className="mb-2 text-sm font-semibold">Lịch sử nhập</p>
            <ul className="space-y-1 text-xs text-muted">
              {list.data.batches.map((b: any) => (
                <li key={b.id}>{dateTime(b.createdAt)} · {num(b.totalLines)} dòng → nhận {num(b.accepted)}, trùng {num(b.duplicates)}, lỗi {num(b.invalid)}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
