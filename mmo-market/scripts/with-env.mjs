// Nạp biến môi trường từ .env ở thư mục gốc rồi chạy lệnh (đa nền tảng: Windows/macOS/Linux).
// Dùng: node scripts/with-env.mjs <lệnh> [tham số...]
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Thiếu lệnh cần chạy');
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
child.on('exit', (code) => process.exit(code ?? 1));
