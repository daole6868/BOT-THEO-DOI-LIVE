'use client';
import { Spinner, useToast } from '@mmo/ui';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { errMsg, uploadImage } from '@/lib/api';

export interface UploadedImage {
  id: string;
  url: string;
}

/** Tải ảnh lên (server sẽ nén lại & xoá EXIF). */
export function ImageUpload({ purpose, value, onChange, max = 1, label = 'Tải ảnh' }: { purpose: string; value: UploadedImage[]; onChange: (v: UploadedImage[]) => void; max?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out = [...value];
      for (const f of Array.from(files).slice(0, max - value.length)) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error('Ảnh quá lớn', 'Tối đa 8MB mỗi ảnh');
          continue;
        }
        const r = await uploadImage(f, purpose);
        out.push({ id: r.id, url: r.url });
      }
      onChange(out);
    } catch (e) {
      toast.error('Tải ảnh thất bại', errMsg(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((img) => (
        <div key={img.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onChange(value.filter((x) => x.id !== img.id))} className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-0.5 text-white" aria-label="Xoá ảnh">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => ref.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted hover:border-primary hover:text-primary">
          {busy ? <Spinner /> : <ImagePlus className="h-5 w-5" />}
          {label}
        </button>
      )}
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple={max > 1} className="hidden" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
