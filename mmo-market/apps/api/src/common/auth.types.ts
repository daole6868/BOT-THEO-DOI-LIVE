import type { Role, Session, Store, User } from '@prisma/client';

export type AuthUser = User & { role: Role | null };

export interface AuthContext {
  user: AuthUser;
  session: Session;
  store?: Store | null;
  ip: string;
  userAgent: string;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}
