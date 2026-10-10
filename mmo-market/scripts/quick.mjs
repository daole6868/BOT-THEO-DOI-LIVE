// Chạy nhanh toàn bộ hệ thống CHỈ CẦN Node.js (Windows / macOS / Linux):
//   - PostgreSQL nhúng (tự tải qua npm, dữ liệu lưu ở thư mục .data/postgres)
//   - Redis giả lập trong bộ nhớ
//   - Tự tạo .env, tạo bảng, dữ liệu mẫu (lần đầu), rồi chạy API + web + admin
// Dùng: npm run quick        (Ctrl + C để dừng)
//       npm run quick -- --reset   (xoá dữ liệu cũ, tạo lại từ đầu)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_PORT = Number(process.env.QUICK_PG_PORT || 54329);
const PG_PASSWORD = 'mmo_local_only';
const dataDir = process.env.QUICK_PG_DIR || path.join(root, '.data', 'postgres');
const isWin = process.platform === 'win32';

const say = (m) => console.log(`\x1b[36m[quick]\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m[quick] ${m}\x1b[0m`);
  process.exit(1);
};

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Cần Node.js 20 trở lên (máy đang có ${process.versions.node}). Tải tại https://nodejs.org`);

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  fail('Chưa cài thư viện. Hãy chạy "npm install" trước, rồi chạy lại "npm run quick".');
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
    s.setTimeout(1000, () => (s.destroy(), resolve(false)));
  });

/** Chạy lệnh npm và chờ xong; thoát nếu lỗi. */
function npm(args, env) {
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', args, { cwd: root, env, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`Lệnh "npm ${args.join(' ')}" bị lỗi (mã ${r.status}).`);
}

// 1. File .env (bí mật ngẫu nhiên) nếu chưa có
spawnSync(process.execPath, [path.join(root, 'scripts', 'setup.mjs'), '--env-only'], { cwd: root, stdio: 'inherit' });

// 2. Các cổng ứng dụng phải trống
for (const [port, name] of [[4000, 'API'], [3000, 'web'], [3001, 'admin']]) {
  if (await portOpen(port)) fail(`Cổng ${port} (${name}) đang bị chương trình khác dùng. Hãy tắt cửa sổ "npm run dev"/"npm run quick" cũ rồi thử lại.`);
}

// 3. PostgreSQL nhúng
if (process.argv.includes('--reset') && existsSync(dataDir)) {
  say('Xoá dữ liệu cũ (--reset)...');
  rmSync(dataDir, { recursive: true, force: true });
}
const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: PG_PASSWORD,
  port: PG_PORT,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  // Linux chạy bằng root (máy chủ / container): PostgreSQL không chạy được dưới root
  createPostgresUser: !isWin && typeof process.getuid === 'function' && process.getuid() === 0,
  onLog: () => {},
  onError: (e) => {
    const m = String(e?.message ?? e);
    if (/ERROR|FATAL|PANIC/.test(m) && !/already exists/.test(m)) console.error(`[postgres] ${m.trim()}`);
  },
});

let pgStarted = false;
if (fresh) {
  say('Lần đầu chạy: khởi tạo PostgreSQL (khoảng 10–30 giây)...');
  await pg.initialise();
}
if (await portOpen(PG_PORT)) {
  say(`PostgreSQL đã chạy sẵn ở cổng ${PG_PORT}, dùng lại.`);
} else {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (existsSync(pidFile)) {
    // Lần trước bị tắt đột ngột -> xoá khoá cũ
    try {
      unlinkSync(pidFile);
    } catch {
      /* bỏ qua */
    }
  }
  say(`Bật PostgreSQL (cổng ${PG_PORT})...`);
  try {
    await pg.start();
    pgStarted = true;
  } catch (e) {
    fail(`Không bật được PostgreSQL: ${e?.message ?? e}\n  Thử chạy "npm run quick -- --reset" để tạo lại dữ liệu.`);
  }
}
try {
  await pg.createDatabase('mmo_market');
} catch {
  /* đã có */
}

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:${PG_PASSWORD}@localhost:${PG_PORT}/mmo_market?schema=public`,
  REDIS_URL: 'memory://local',
  APP_ENV: 'local',
  ENABLE_DEV_TOOLS: 'true',
  NEXT_PUBLIC_DEV_TOOLS: 'true',
};

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say('Đang dừng...');
  if (pgStarted) await pg.stop().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 4. Tạo bảng + dữ liệu mẫu (seed tự bỏ qua nếu đã có dữ liệu)
say('Cập nhật cấu trúc cơ sở dữ liệu...');
npm(['run', 'db:migrate', '--silent'], env);
say('Kiểm tra dữ liệu mẫu (lần đầu mất khoảng 30–60 giây)...');
npm(['run', 'db:seed', '--silent'], env);

// 5. Chạy API + web + admin
say('Khởi động API, web, admin. Khi thấy "API đang chạy" hãy mở:');
say('  Web:   http://localhost:3000');
say('  Admin: http://localhost:3001');
say('  Tài khoản demo: admin@mmo.local / buyer1@mmo.local / shopgmail@mmo.local – mật khẩu MatKhau@2026');
say('  Nhấn Ctrl + C để dừng.');
const dev = spawn(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd: root, env, stdio: 'inherit', shell: isWin });
dev.on('exit', (code) => shutdown(code ?? 0));
