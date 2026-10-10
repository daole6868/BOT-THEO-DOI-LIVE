// Chuẩn bị môi trường chạy trên máy: tạo .env (bí mật ngẫu nhiên), migrate DB, seed dữ liệu mẫu.
// Dùng: node scripts/setup.mjs            -> tạo .env + migrate + seed
//       node scripts/setup.mjs --env-only -> chỉ tạo .env
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!existsSync(envPath)) {
  let env = readFileSync(examplePath, 'utf8');
  env = env
    .replace(/^MASTER_KEY=.*$/m, `MASTER_KEY=${randomBytes(32).toString('base64')}`)
    .replace(/^PAYMENT_WEBHOOK_SECRET=.*$/m, `PAYMENT_WEBHOOK_SECRET=${randomBytes(32).toString('hex')}`);
  writeFileSync(envPath, env);
  console.log('✔ Đã tạo .env với bí mật ngẫu nhiên');
} else {
  console.log('• Đã có .env, giữ nguyên');
}

if (process.argv.includes('--env-only')) process.exit(0);

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
};

run('npm run db:migrate');
run('npm run db:seed');
console.log('\n✔ Xong. Chạy `npm run dev` rồi mở http://localhost:3000 (web) và http://localhost:3001 (admin).');
