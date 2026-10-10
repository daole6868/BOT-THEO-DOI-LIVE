'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Me {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  hasPin: boolean;
  isStaff: boolean;
  withdrawLockedUntil: string | null;
  createdAt: string;
  store: { id: string; slug: string; name: string; level: string; status: string; avatarUrl: string | null } | null;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: Me | null; unreadNotifications?: number }>('/auth/me'),
    staleTime: 30_000,
  });
}

export function useWallet(enabled = true) {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<{ available: number; pendingWithdrawal: number; incomingEscrow: number }>('/wallet'),
    enabled,
    staleTime: 15_000,
  });
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  productCount: number;
  defaultDelivery: string;
  children: CategoryNode[];
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: 5 * 60_000 });
}

export function flattenCategories(nodes: CategoryNode[] = [], depth = 0): (CategoryNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenCategories(n.children, depth + 1)]);
}
