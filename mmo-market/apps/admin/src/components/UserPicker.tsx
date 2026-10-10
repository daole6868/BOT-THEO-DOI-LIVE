'use client';
import { useQuery } from '@tanstack/react-query';
import { Avatar, cn } from '@mmo/ui';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { SearchInput } from '@/components/Toolbar';
import { api } from '@/lib/api';

export interface PickedUser {
  id: string;
  username: string;
  displayName: string;
}

/** Tìm & chọn người dùng theo username / email / ID. */
export function UserPicker({ value, onChange }: { value: PickedUser | null; onChange: (u: PickedUser | null) => void }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({ queryKey: ['user-pick', q], queryFn: () => api<any>(`/admin/users?pageSize=6&q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });
  if (value)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary-soft p-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="flex-1">{value.displayName} <span className="text-muted">@{value.username}</span></span>
        <button type="button" className="text-xs text-primary" onClick={() => onChange(null)}>Đổi</button>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <SearchInput value={q} onChange={setQ} placeholder="Nhập username, email hoặc ID người dùng" />
      {q.length >= 2 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {!data?.items.length && <li className="p-2 text-xs text-muted">Không tìm thấy</li>}
          {data?.items.map((u: any) => (
            <li key={u.id}>
              <button type="button" onClick={() => onChange({ id: u.id, username: u.username, displayName: u.displayName })} className={cn('flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-subtle')}>
                <Avatar name={u.displayName} size={24} />
                <span className="flex-1">{u.displayName} <span className="text-muted">@{u.username}</span></span>
                <span className="font-mono text-[11px] text-muted">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
