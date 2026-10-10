'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Staff {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: { name: string; permissions: string[] } | null;
}

export function useStaff() {
  return useQuery({ queryKey: ['admin-me'], queryFn: () => api<{ user: Staff | null }>('/admin/auth/me'), staleTime: 60_000 });
}

/** Kiểm tra quyền phía giao diện (server vẫn kiểm tra lại mọi request). */
export function useCan() {
  const { data } = useStaff();
  const perms = data?.user?.role?.permissions ?? [];
  return (p: string) => perms.includes('*') || perms.includes(p);
}

export const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Quản trị', FINANCE: 'Kế toán', SUPPORT: 'CSKH', MODERATOR: 'Kiểm duyệt' };
