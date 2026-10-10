import type { Role, Store, User } from '@prisma/client';

/** Chỉ trả về các trường an toàn của người dùng (không bao giờ trả hash/secret). */
export function serializeMe(user: User & { role?: Role | null }, store?: Store | null) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    emailVerified: !!user.emailVerifiedAt,
    mfaEnabled: user.mfaEnabled,
    hasPin: !!user.txnPinHash,
    isStaff: user.isStaff,
    role: user.role ? { name: user.role.name, permissions: user.role.permissions } : null,
    withdrawLockedUntil: user.withdrawLockedUntil,
    createdAt: user.createdAt,
    store: store
      ? { id: store.id, slug: store.slug, name: store.name, level: store.level, status: store.status, avatarUrl: store.avatarUrl }
      : null,
  };
}

export function publicUser(u: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl'> & { isStaff?: boolean }) {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, isStaff: !!u.isStaff };
}
