// In ra bộ bí mật ngẫu nhiên để dán vào .env khi chạy thật.
import { randomBytes } from 'node:crypto';

const lines = [
  `MASTER_KEY=${randomBytes(32).toString('base64')}`,
  `PAYMENT_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`,
  `POSTGRES_PASSWORD=${randomBytes(18).toString('base64url')}`,
  `REDIS_PASSWORD=${randomBytes(18).toString('base64url')}`,
];
console.log('# Dán các dòng sau vào .env (và cập nhật DATABASE_URL / REDIS_URL theo mật khẩu mới):');
console.log(lines.join('\n'));
