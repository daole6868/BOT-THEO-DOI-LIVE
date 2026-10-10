import { Algorithm, hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { deriveKey } from './crypto/crypto';

let pepper: Buffer | null = null;
function getPepper() {
  if (!pepper) pepper = deriveKey(Buffer.from(env.MASTER_KEY, 'base64'), 'mmo:password-pepper:v1');
  return pepper;
}

const OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };

export function hashPassword(password: string, pepperOverride?: Buffer): Promise<string> {
  return hash(password, { ...OPTS, secret: pepperOverride ?? getPepper() });
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password, { secret: getPepper() });
  } catch {
    return false;
  }
}

/** Hash giả để thời gian phản hồi như nhau khi tài khoản không tồn tại. */
let dummyHash: string | null = null;
export async function burnTime(password: string) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  await verifyPassword(dummyHash, password);
}

export function passwordProblems(password: string, ...personal: string[]): string | null {
  if (password.length < 10) return 'Mật khẩu tối thiểu 10 ký tự';
  if (password.length > 128) return 'Mật khẩu tối đa 128 ký tự';
  const lower = password.toLowerCase();
  for (const p of personal) {
    const v = p?.toLowerCase().split('@')[0];
    if (v && v.length >= 4 && lower.includes(v)) return 'Mật khẩu không được chứa email hoặc tên đăng nhập';
  }
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|abcdefghij)/i.test(password)) return 'Mật khẩu quá dễ đoán';
  return null;
}

/** Kiểm tra mật khẩu đã lộ qua HaveIBeenPwned (k-anonymity: chỉ gửi 5 ký tự đầu SHA-1). Lỗi mạng -> bỏ qua. */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (!env.PASSWORD_BREACH_CHECK) return false;
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split('\n').some((line) => {
      const [suf, count] = line.trim().split(':');
      return suf === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}
