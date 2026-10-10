import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Nạp .env ở thư mục gốc monorepo nếu biến chưa có (không ghi đè biến môi trường thật). */
function loadDotEnv() {
  const candidates = [path.resolve(process.cwd(), '../../.env'), path.resolve(process.cwd(), '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}
loadDotEnv();

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const list = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

export const DEV_MASTER_KEY = 'ZGV2LW9ubHktbWFzdGVyLWtleS1jaGFuZ2UtbWUtISE=';

const schema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  APP_NAME: z.string().default('MMO Market'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  ADMIN_ORIGIN: z.string().url().default('http://localhost:3001'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MASTER_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'MASTER_KEY phải là 32 byte dạng base64'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  SEPAY_API_KEY: z.string().optional().default(''),
  PAYMENT_WEBHOOK_IP_ALLOWLIST: list,
  COOKIE_SECURE: bool,
  TRUST_PROXY: z.coerce.number().int().default(1),
  DEPOSIT_BANK_BIN: z.string().regex(/^\d{6}$/).default('970422'),
  DEPOSIT_BANK_NAME: z.string().default('MB Bank'),
  DEPOSIT_ACCOUNT_NO: z.string().regex(/^\d{4,19}$/).default('0000123456789'),
  DEPOSIT_ACCOUNT_NAME: z.string().default('CONG TY TNHH MMO MARKET'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('MMO Market <no-reply@mmomarket.local>'),
  TURNSTILE_SECRET_KEY: z.string().optional().default(''),
  PASSWORD_BREACH_CHECK: bool,
  ADMIN_IP_ALLOWLIST: list,
  ENABLE_DEV_TOOLS: bool,
  STORAGE_DIR: z.string().default('./storage'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Cấu hình môi trường không hợp lệ:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

/** Chặn khởi động production với cấu hình dev không an toàn. */
export function assertProductionSafety() {
  if (env.APP_ENV !== 'production') return;
  const problems: string[] = [];
  if (env.MASTER_KEY === DEV_MASTER_KEY) problems.push('MASTER_KEY đang là khoá dev công khai');
  if (env.PAYMENT_WEBHOOK_SECRET.startsWith('dev-only')) problems.push('PAYMENT_WEBHOOK_SECRET đang là giá trị dev');
  if (env.ENABLE_DEV_TOOLS) problems.push('ENABLE_DEV_TOOLS phải tắt');
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE phải bật (HTTPS)');
  if (!env.TURNSTILE_SECRET_KEY) problems.push('Cần cấu hình TURNSTILE_SECRET_KEY (CAPTCHA)');
  if (env.REDIS_URL.startsWith('memory')) problems.push('REDIS_URL=memory:// chỉ dùng để chạy thử, production cần Redis thật');
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('❌ Không thể chạy production:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}

export const cookieNames = {
  web: env.COOKIE_SECURE ? '__Host-sid' : 'sid',
  admin: env.COOKIE_SECURE ? '__Host-admin_sid' : 'admin_sid',
  csrfWeb: env.COOKIE_SECURE ? '__Host-csrf_web' : 'csrf_web',
  csrfAdmin: env.COOKIE_SECURE ? '__Host-csrf_admin' : 'csrf_admin',
};
