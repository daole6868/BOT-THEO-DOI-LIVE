/* eslint-disable no-console */
/**
 * Dữ liệu mẫu cho MMO Market: danh mục + thuộc tính lọc, nhân sự, người bán, sản phẩm có kho mã hoá,
 * lịch sử đơn hàng 60 ngày (sổ cái cân đối), bài yêu cầu + bình luận + báo giá, chat, báo cáo...
 * Chạy: npm run db:seed   (bỏ qua nếu DB đã có dữ liệu; thêm --force để seed lại sau khi reset)
 */
import '../src/config/env';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../src/config/env';
import { asBytes, randomCode } from '../src/common/crypto/crypto';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { hashPassword } from '../src/common/password';
import { DEFAULT_ROLES } from '../src/common/permissions';
import { maskSecret, renderMarkdown, slugify, toSearchText } from '../src/common/text';
import { Acct, postLedger } from '../src/modules/ledger/ledger.core';

const prisma = new PrismaClient();
const crypto = new CryptoService();
const DEMO_PASSWORD = 'MatKhau@2026';
const DAY = 24 * 3600_000;

// Bộ sinh số ngẫu nhiên có hạt giống -> dữ liệu mẫu ổn định giữa các lần chạy
let seed = 20261010;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const COUNTRIES = opts([['VN', 'Việt Nam'], ['US', 'Mỹ'], ['UK', 'Anh'], ['DE', 'Đức'], ['FR', 'Pháp'], ['JP', 'Nhật Bản'], ['KR', 'Hàn Quốc'], ['TH', 'Thái Lan'], ['ID', 'Indonesia'], ['OTHER', 'Khác']]);

type AttrDef = { key: string; label: string; type: 'SELECT' | 'MULTISELECT' | 'NUMBER' | 'BOOLEAN' | 'TEXT'; options?: { value: string; label: string }[]; unit?: string; isRequired?: boolean };
type CatDef = { slug: string; name: string; icon: string; feeBps: number; delivery: 'AUTO' | 'MANUAL'; description: string; attrs?: AttrDef[]; children?: CatDef[] };

const CATEGORIES: CatDef[] = [
  {
    slug: 'tai-khoan', name: 'Tài khoản', icon: 'user-round', feeBps: 500, delivery: 'AUTO', description: 'Tài khoản email, mạng xã hội, công cụ AI, game (tự tạo, sở hữu hợp pháp)',
    attrs: [{ key: 'country', label: 'Quốc gia', type: 'SELECT', options: COUNTRIES }],
    children: [
      {
        slug: 'tai-khoan-email', name: 'Email', icon: 'mail', feeBps: 500, delivery: 'AUTO', description: 'Gmail, Outlook, Yahoo...',
        attrs: [
          { key: 'provider', label: 'Nhà cung cấp', type: 'SELECT', options: opts([['gmail', 'Gmail'], ['outlook', 'Outlook / Hotmail'], ['yahoo', 'Yahoo'], ['proton', 'ProtonMail'], ['other', 'Khác']]), isRequired: true },
          { key: 'created_year', label: 'Năm tạo', type: 'NUMBER', unit: '' },
          { key: 'phone_verified', label: 'Đã xác minh SĐT', type: 'BOOLEAN' },
          { key: 'has_2fa', label: 'Có 2FA', type: 'BOOLEAN' },
        ],
      },
      {
        slug: 'tai-khoan-mxh', name: 'Mạng xã hội', icon: 'users', feeBps: 600, delivery: 'AUTO', description: 'Facebook, TikTok, Instagram, Telegram...',
        attrs: [
          { key: 'platform', label: 'Nền tảng', type: 'SELECT', options: opts([['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['twitter', 'X / Twitter'], ['telegram', 'Telegram'], ['discord', 'Discord'], ['youtube', 'YouTube']]), isRequired: true },
          { key: 'created_year', label: 'Năm tạo', type: 'NUMBER' },
          { key: 'followers', label: 'Số follower', type: 'NUMBER' },
          { key: 'has_2fa', label: 'Có 2FA', type: 'BOOLEAN' },
        ],
      },
      {
        slug: 'tai-khoan-ai', name: 'AI & Công cụ', icon: 'sparkles', feeBps: 500, delivery: 'AUTO', description: 'Gói dịch vụ AI, thiết kế, giải trí',
        attrs: [
          { key: 'service', label: 'Dịch vụ', type: 'SELECT', options: opts([['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['midjourney', 'Midjourney'], ['canva', 'Canva'], ['capcut', 'CapCut'], ['netflix', 'Netflix'], ['spotify', 'Spotify'], ['youtube_premium', 'YouTube Premium']]), isRequired: true },
          { key: 'duration_days', label: 'Thời hạn', type: 'NUMBER', unit: 'ngày' },
          { key: 'plan', label: 'Loại gói', type: 'SELECT', options: opts([['personal', 'Cá nhân (riêng)'], ['shared', 'Dùng chung'], ['family', 'Gia đình']]) },
        ],
      },
      {
        slug: 'tai-khoan-game', name: 'Tài khoản game', icon: 'gamepad-2', feeBps: 600, delivery: 'AUTO', description: 'Steam, Liên Quân, Free Fire...',
        attrs: [
          { key: 'game', label: 'Game', type: 'SELECT', options: opts([['steam', 'Steam'], ['lien_quan', 'Liên Quân'], ['free_fire', 'Free Fire'], ['pubg', 'PUBG'], ['valorant', 'Valorant'], ['genshin', 'Genshin Impact']]) },
          { key: 'rank', label: 'Rank / cấp', type: 'TEXT' },
        ],
      },
    ],
  },
  {
    slug: 'phan-mem-tool', name: 'Phần mềm & Tool', icon: 'wrench', feeBps: 700, delivery: 'AUTO', description: 'Tool automation, extension, bot, phần mềm bản quyền',
    attrs: [
      { key: 'os', label: 'Hệ điều hành', type: 'MULTISELECT', options: opts([['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux'], ['android', 'Android'], ['ios', 'iOS'], ['web', 'Web / trình duyệt']]) },
      { key: 'license', label: 'Bản quyền', type: 'SELECT', options: opts([['lifetime', 'Vĩnh viễn'], ['monthly', 'Theo tháng'], ['yearly', 'Theo năm']]) },
    ],
    children: [
      { slug: 'tool-automation', name: 'Tool automation', icon: 'bot', feeBps: 700, delivery: 'AUTO', description: 'Tool tự động hoá, nuôi tài khoản, đăng bài' },
      { slug: 'extension-bot', name: 'Extension & Bot', icon: 'puzzle', feeBps: 700, delivery: 'AUTO', description: 'Tiện ích trình duyệt, bot Telegram/Discord' },
      { slug: 'ban-quyen', name: 'Phần mềm bản quyền', icon: 'shield-check', feeBps: 600, delivery: 'AUTO', description: 'Key Windows, Office, antivirus...' },
    ],
  },
  {
    slug: 'key-the', name: 'Key & Thẻ', icon: 'key-round', feeBps: 400, delivery: 'AUTO', description: 'Key game, gift card',
    children: [
      {
        slug: 'key-game', name: 'Key game', icon: 'gamepad', feeBps: 400, delivery: 'AUTO', description: 'Steam, Epic, Xbox...',
        attrs: [
          { key: 'store', label: 'Nền tảng', type: 'SELECT', options: opts([['steam', 'Steam'], ['epic', 'Epic Games'], ['xbox', 'Xbox'], ['playstation', 'PlayStation'], ['ubisoft', 'Ubisoft']]) },
          { key: 'region', label: 'Khu vực', type: 'SELECT', options: opts([['global', 'Global'], ['vn', 'Việt Nam'], ['sea', 'Đông Nam Á'], ['us', 'Mỹ'], ['eu', 'Châu Âu']]) },
        ],
      },
      {
        slug: 'gift-card', name: 'Gift card', icon: 'gift', feeBps: 300, delivery: 'AUTO', description: 'Google Play, Apple, Steam Wallet...',
        attrs: [
          { key: 'brand', label: 'Thương hiệu', type: 'SELECT', options: opts([['google_play', 'Google Play'], ['apple', 'Apple'], ['steam', 'Steam Wallet'], ['garena', 'Garena'], ['amazon', 'Amazon']]) },
          { key: 'face_value', label: 'Mệnh giá', type: 'NUMBER', unit: 'đ' },
        ],
      },
    ],
  },
  {
    slug: 'proxy-vps', name: 'Proxy, VPS & Hạ tầng', icon: 'server', feeBps: 500, delivery: 'AUTO', description: 'Proxy, VPS, domain, hosting',
    children: [
      {
        slug: 'proxy', name: 'Proxy', icon: 'globe', feeBps: 500, delivery: 'AUTO', description: 'Proxy dân cư, datacenter, 4G',
        attrs: [
          { key: 'proxy_type', label: 'Loại proxy', type: 'SELECT', options: opts([['residential', 'Dân cư (Residential)'], ['datacenter', 'Datacenter'], ['mobile', '4G / Mobile'], ['isp', 'ISP tĩnh']]), isRequired: true },
          { key: 'protocol', label: 'Giao thức', type: 'MULTISELECT', options: opts([['http', 'HTTP(S)'], ['socks5', 'SOCKS5']]) },
          { key: 'location', label: 'Vị trí', type: 'SELECT', options: COUNTRIES },
          { key: 'duration_days', label: 'Thời hạn', type: 'NUMBER', unit: 'ngày' },
        ],
      },
      {
        slug: 'vps', name: 'VPS', icon: 'hard-drive', feeBps: 500, delivery: 'AUTO', description: 'VPS Windows/Linux',
        attrs: [
          { key: 'cpu', label: 'CPU', type: 'NUMBER', unit: 'core' },
          { key: 'ram_gb', label: 'RAM', type: 'NUMBER', unit: 'GB' },
          { key: 'location', label: 'Vị trí', type: 'SELECT', options: COUNTRIES },
        ],
      },
      { slug: 'domain-hosting', name: 'Domain & Hosting', icon: 'link', feeBps: 500, delivery: 'MANUAL', description: 'Tên miền, hosting, SSL' },
    ],
  },
  {
    slug: 'dich-vu', name: 'Dịch vụ MMO', icon: 'briefcase', feeBps: 800, delivery: 'MANUAL', description: 'Dịch vụ thực hiện theo yêu cầu (giao thủ công)',
    children: [
      { slug: 'thiet-ke', name: 'Thiết kế', icon: 'palette', feeBps: 800, delivery: 'MANUAL', description: 'Logo, banner, ảnh sản phẩm' },
      { slug: 'noi-dung', name: 'Viết nội dung', icon: 'pen-line', feeBps: 800, delivery: 'MANUAL', description: 'Bài SEO, kịch bản video' },
      { slug: 'quang-cao', name: 'Setup quảng cáo', icon: 'megaphone', feeBps: 800, delivery: 'MANUAL', description: 'Chạy quảng cáo Facebook/Google/TikTok',
        attrs: [{ key: 'ad_platform', label: 'Nền tảng', type: 'SELECT', options: opts([['facebook', 'Facebook Ads'], ['google', 'Google Ads'], ['tiktok', 'TikTok Ads']]) }] },
      { slug: 'lap-trinh', name: 'Lập trình theo yêu cầu', icon: 'code', feeBps: 800, delivery: 'MANUAL', description: 'Tool, website, bot theo yêu cầu' },
    ],
  },
  {
    slug: 'khoa-hoc', name: 'Khoá học & Tài liệu', icon: 'graduation-cap', feeBps: 1000, delivery: 'AUTO', description: 'Khoá học, ebook, template, source code',
    children: [
      { slug: 'khoa-hoc-mmo', name: 'Khoá học', icon: 'book-open', feeBps: 1000, delivery: 'AUTO', description: 'Khoá học kiếm tiền online' },
      { slug: 'source-code', name: 'Template & Source code', icon: 'file-code', feeBps: 1000, delivery: 'AUTO', description: 'Theme, plugin, source code' },
    ],
  },
];

const BANNED = [
  ['hack tài khoản', 'BLOCK'], ['acc hack', 'BLOCK'], ['tài khoản bị hack', 'BLOCK'], ['thẻ tín dụng', 'BLOCK'], ['cvv', 'BLOCK'],
  ['clone thẻ', 'BLOCK'], ['data khách hàng', 'BLOCK'], ['dữ liệu cá nhân', 'BLOCK'], ['cccd giả', 'BLOCK'], ['phishing', 'BLOCK'],
  ['ransomware', 'BLOCK'], ['ddos', 'BLOCK'], ['cá độ', 'BLOCK'], ['cờ bạc', 'BLOCK'], ['thuê tài khoản ngân hàng', 'BLOCK'],
  ['sim chính chủ', 'BLOCK'], ['cookie', 'REVIEW'], ['bypass', 'REVIEW'], ['crack', 'REVIEW'],
] as const;

// ---------------------------------------------------------------- ảnh mẫu

const PALETTE = [['#4f46e5', '#06b6d4'], ['#0ea5e9', '#22c55e'], ['#f97316', '#ec4899'], ['#8b5cf6', '#ec4899'], ['#14b8a6', '#6366f1'], ['#ef4444', '#f59e0b'], ['#0f172a', '#4f46e5']];

async function saveImage(ownerId: string, purpose: string, isPublic: boolean, svg: string) {
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}.webp`;
  const dir = path.join(path.resolve(env.STORAGE_DIR), isPublic ? 'public' : 'private', path.dirname(key));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(path.resolve(env.STORAGE_DIR), isPublic ? 'public' : 'private', key), buf.data);
  const u = await prisma.upload.create({ data: { ownerId, purpose, storageKey: key, isPublic, mime: 'image/webp', size: buf.data.length, width: buf.info.width, height: buf.info.height } });
  return { id: u.id, url: isPublic ? `/api/files/p/${key}` : key };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
function productSvg(title: string, sub: string, idx: number) {
  const [a, b] = PALETTE[idx % PALETTE.length];
  const t = esc(title.length > 26 ? title.slice(0, 25) + '…' : title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="800" height="600" fill="url(#g)"/><circle cx="660" cy="120" r="160" fill="#ffffff" opacity="0.12"/><circle cx="120" cy="520" r="200" fill="#ffffff" opacity="0.08"/>
  <rect x="60" y="230" width="680" height="150" rx="24" fill="#000" opacity="0.18"/>
  <text x="400" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="46" font-weight="700" fill="#fff" text-anchor="middle">${t}</text>
  <text x="400" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" fill="#fff" opacity="0.9" text-anchor="middle">${esc(sub)}</text></svg>`;
}
function avatarSvg(letter: string, idx: number) {
  const [a, b] = PALETTE[idx % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><text x="150" y="190" font-family="DejaVu Sans, Arial, sans-serif" font-size="140" font-weight="700" fill="#fff" text-anchor="middle">${esc(letter)}</text></svg>`;
}
function docSvg(label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560"><rect width="900" height="560" rx="30" fill="#e2e8f0"/><rect x="40" y="40" width="220" height="280" rx="16" fill="#94a3b8"/><rect x="300" y="70" width="520" height="30" rx="8" fill="#64748b"/><rect x="300" y="130" width="420" height="24" rx="8" fill="#94a3b8"/><rect x="300" y="180" width="460" height="24" rx="8" fill="#94a3b8"/><text x="450" y="470" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#334155" text-anchor="middle">${esc(label)} (ảnh mẫu)</text></svg>`;
}

// ---------------------------------------------------------------- tiện ích

async function createUser(u: { email: string; username: string; displayName: string; staffRole?: string; createdAt?: Date }, pwHash: string, roles: Map<string, string>) {
  return prisma.user.create({
    data: {
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      passwordHash: pwHash,
      status: 'ACTIVE',
      emailVerifiedAt: u.createdAt ?? new Date(),
      isStaff: !!u.staffRole,
      roleId: u.staffRole ? roles.get(u.staffRole) : null,
      createdAt: u.createdAt ?? new Date(Date.now() - int(30, 400) * DAY),
      lastLoginAt: new Date(Date.now() - int(0, 5) * DAY),
    },
  });
}

async function deposit(userId: string, amount: number, at: Date) {
  return prisma.$transaction(async (tx) => {
    const d = await tx.deposit.create({
      data: { code: `NAP${randomCode(8)}`, userId, amountExpected: BigInt(amount), amountReceived: BigInt(amount), status: 'COMPLETED', provider: 'seed', providerTxnId: randomUUID(), idempotencyKey: randomUUID(), expiresAt: new Date(at.getTime() + 30 * 60_000), completedAt: at, createdAt: at },
    });
    await postLedger(tx, { type: 'deposit', refType: 'deposit', refId: d.id, idempotencyKey: `deposit:${d.id}`, description: `Nạp tiền ${d.code}`, createdAt: at, entries: [{ account: Acct.bank, side: 'D', amount: BigInt(amount) }, { account: Acct.available(userId), side: 'C', amount: BigInt(amount) }] });
  });
}

const STOCK_FORMATS: Record<string, (i: number) => string> = {
  email: (i) => `demo.mail${i}.${randomCode(4).toLowerCase()}@gmail.com|${randomCode(10)}|recovery${i}@outlook.com`,
  mxh: (i) => `user_${randomCode(6).toLowerCase()}${i}|${randomCode(12)}|2FA:${randomCode(16)}`,
  ai: (i) => `ai.account${i}.${randomCode(4).toLowerCase()}@mail.com|${randomCode(12)}`,
  key: () => `${randomCode(5)}-${randomCode(5)}-${randomCode(5)}`,
  proxy: (i) => `103.${int(10, 250)}.${int(1, 250)}.${(i % 250) + 1}:${int(10000, 60000)}:user${randomCode(4).toLowerCase()}:${randomCode(10)}`,
  vps: (i) => `IP: 45.${int(10, 250)}.${int(1, 250)}.${(i % 250) + 1} | user: Administrator | pass: ${randomCode(14)}`,
  course: (i) => `https://drive.example.com/khoa-hoc/${randomCode(12)} | Mã kích hoạt: ${randomCode(8)}-${i}`,
};

async function addStock(productId: string, uploadedById: string, count: number, fmt: string) {
  const { dek, wrapped } = crypto.newDek();
  const batch = await prisma.stockBatch.create({ data: { productId, uploadedById, dekWrapped: wrapped, totalLines: count, accepted: count, duplicates: 0, invalid: 0 } });
  const rows: Prisma.StockItemCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    const content = STOCK_FORMATS[fmt](i);
    const id = randomUUID();
    rows.push({ id, productId, batchId: batch.id, contentEnc: crypto.encryptStock(dek, id, productId, content), contentHmac: asBytes(crypto.stockHmac(content)), preview: maskSecret(content), createdAt: new Date(Date.now() - (count - i) * 1000) });
  }
  for (let i = 0; i < rows.length; i += 1000) await prisma.stockItem.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
}

// ---------------------------------------------------------------- main

async function main() {
  const force = process.argv.includes('--force');
  if ((await prisma.category.count()) > 0 && !force) {
    console.log('• Cơ sở dữ liệu đã có dữ liệu, bỏ qua seed. (Dùng npm run db:reset để xoá và seed lại)');
    return;
  }
  if (process.env.APP_ENV === 'production' && process.env.SEED_DEMO !== 'false') {
    console.error('❌ APP_ENV=production: không được tạo dữ liệu demo. Đặt SEED_DEMO=false để chỉ khởi tạo danh mục và tài khoản Super Admin.');
    process.exit(1);
  }
  if (process.env.SEED_DEMO === 'false') {
    console.log('• SEED_DEMO=false: chỉ tạo vai trò, danh mục và tài khoản Super Admin.');
  }
  const demo = process.env.SEED_DEMO !== 'false';
  console.log('→ Đang tạo dữ liệu mẫu...');
  const pw = await hashPassword(DEMO_PASSWORD);

  // Vai trò
  const roles = new Map<string, string>();
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.create({ data: { ...r, isSystem: true } });
    roles.set(r.name, role.id);
  }

  // Danh mục
  const catIds = new Map<string, { id: string; path: string; name: string; feeBps: number }>();
  let order = 0;
  const createCat = async (c: CatDef, parent?: { id: string; path: string }) => {
    const p = parent ? `${parent.path}/${c.slug}` : c.slug;
    const cat = await prisma.category.create({ data: { slug: c.slug, name: c.name, icon: c.icon, description: c.description, feeBps: c.feeBps, defaultDelivery: c.delivery, path: p, parentId: parent?.id ?? null, sortOrder: order++ } });
    catIds.set(c.slug, { id: cat.id, path: p, name: c.name, feeBps: c.feeBps });
    for (const [i, a] of (c.attrs ?? []).entries()) {
      await prisma.categoryAttribute.create({ data: { categoryId: cat.id, key: a.key, label: a.label, type: a.type, options: (a.options ?? undefined) as Prisma.InputJsonValue | undefined, unit: a.unit || null, isRequired: !!a.isRequired, sortOrder: i } });
    }
    for (const ch of c.children ?? []) await createCat(ch, { id: cat.id, path: p });
  };
  for (const c of CATEGORIES) await createCat(c);

  for (const [pattern, action] of BANNED) await prisma.bannedKeyword.create({ data: { pattern, action } });

  if (!demo) {
    // Chạy thật: chỉ 1 Super Admin với mật khẩu ngẫu nhiên (hoặc ADMIN_INITIAL_PASSWORD), không dùng mật khẩu demo công khai
    const email = (process.env.ADMIN_EMAIL || 'admin@mmo.local').toLowerCase();
    const initial = process.env.ADMIN_INITIAL_PASSWORD || `${randomBytes(9).toString('base64url')}#9a`;
    await createUser({ email, username: 'superadmin', displayName: 'Quản trị viên', staffRole: 'SUPER_ADMIN' }, await hashPassword(initial), roles);
    console.log(`✔ Xong (không có dữ liệu demo).\n  Super Admin: ${email}\n  Mật khẩu tạm: ${initial}\n  → Đăng nhập trang quản trị, cài 2FA và đổi mật khẩu ngay. Mật khẩu này chỉ hiển thị một lần.`);
    return;
  }

  // Nhân sự (đăng nhập admin lần đầu sẽ bắt buộc cài 2FA)
  const admin = await createUser({ email: 'admin@mmo.local', username: 'superadmin', displayName: 'Quản trị viên', staffRole: 'SUPER_ADMIN' }, pw, roles);
  const finance = await createUser({ email: 'ketoan@mmo.local', username: 'ketoan', displayName: 'Kế toán Minh', staffRole: 'FINANCE' }, pw, roles);
  await createUser({ email: 'ketoan2@mmo.local', username: 'ketoan2', displayName: 'Kế toán Hà', staffRole: 'FINANCE' }, pw, roles);
  const support = await createUser({ email: 'cskh@mmo.local', username: 'cskh_lan', displayName: 'Hỗ trợ viên Lan', staffRole: 'SUPPORT' }, pw, roles);
  await createUser({ email: 'kiemduyet@mmo.local', username: 'kiemduyet', displayName: 'Kiểm duyệt Nam', staffRole: 'MODERATOR' }, pw, roles);

  await prisma.setting.create({ data: { key: 'site.announcement', value: '🎉 Chào mừng đến MMO Market (bản demo). Mọi giao dịch được giữ tiền an toàn qua ký quỹ.' } });

  // Người mua
  const buyerNames = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thu Hà', 'Vũ Quốc Khánh', 'Đặng Mai Linh', 'Bùi Tuấn Minh', 'Đỗ Ngọc Phương', 'Ngô Thanh Sơn'];
  const buyers = [];
  for (const [i, name] of buyerNames.entries()) {
    const u = await createUser({ email: `buyer${i + 1}@mmo.local`, username: `buyer${i + 1}`, displayName: name, createdAt: new Date(Date.now() - int(70, 300) * DAY) }, pw, roles);
    buyers.push(u);
    await deposit(u.id, int(30, 120) * 100_000, new Date(Date.now() - int(61, 69) * DAY));
  }

  // Người bán + gian hàng
  const sellerDefs = [
    { username: 'shopgmail', name: 'Shop Gmail Pro', full: 'NGUYEN THANH TUNG', level: 'GOLD', bank: '970422' },
    { username: 'proxyviet', name: 'Proxy Việt Speed', full: 'TRAN QUANG HUY', level: 'DIAMOND', bank: '970436' },
    { username: 'aitools', name: 'AI Tools Store', full: 'LE MINH KHOA', level: 'SILVER', bank: '970407' },
    { username: 'keygame', name: 'Key Game Giá Rẻ', full: 'PHAM DUC THANG', level: 'BRONZE', bank: '970416' },
    { username: 'designstudio', name: 'Design Studio 247', full: 'VO THI THU', level: 'SILVER', bank: '970432' },
    { username: 'mmoacademy', name: 'MMO Academy', full: 'DANG VAN LONG', level: 'NEW', bank: '970418' },
  ] as const;
  const BANK_NAMES: Record<string, string> = { '970422': 'MB Bank', '970436': 'Vietcombank', '970407': 'Techcombank', '970416': 'ACB', '970432': 'VPBank', '970418': 'BIDV' };
  const stores: { id: string; ownerId: string; name: string; level: string }[] = [];
  for (const [i, s] of sellerDefs.entries()) {
    const u = await createUser({ email: `${s.username}@mmo.local`, username: s.username, displayName: s.name, createdAt: new Date(Date.now() - int(200, 500) * DAY) }, pw, roles);
    const avatar = await saveImage(u.id, 'avatar', true, avatarSvg(s.name[0], i));
    const banner = await saveImage(u.id, 'banner', true, productSvg(s.name, 'Uy tín · Giao nhanh · Bảo hành rõ ràng', i + 2));
    const docs = await Promise.all(['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh chân dung'].map((l) => saveImage(u.id, 'kyc', false, docSvg(l))));
    const acct = `0${int(100000000, 999999999)}${i}`;
    const idNo = `0${int(10000000000, 99999999999)}`.slice(0, 12);
    await prisma.sellerApplication.create({
      data: {
        userId: u.id, storeName: s.name, storeSlug: slugify(s.name), description: `Gian hàng ${s.name} chuyên cung cấp sản phẩm chất lượng, bảo hành rõ ràng.`, fullName: s.full,
        idNumberHash: crypto.idNumberHash(idNo), idNumberLast4: idNo.slice(-4), idFrontUploadId: docs[0].id, idBackUploadId: docs[1].id, selfieUploadId: docs[2].id,
        bankCode: s.bank, bankName: BANK_NAMES[s.bank], bankAccountEnc: crypto.encryptField(acct, `bank:${u.id}`), bankAccountLast4: acct.slice(-4), bankHolderName: s.full,
        status: 'APPROVED', reviewerId: admin.id, submittedAt: new Date(Date.now() - 190 * DAY), reviewedAt: new Date(Date.now() - 189 * DAY),
      },
    });
    const store = await prisma.store.create({
      data: {
        ownerId: u.id, slug: slugify(s.name), name: s.name, level: s.level, avatarUrl: avatar.url, bannerUrl: banner.url,
        description: `**${s.name}** – hoạt động từ ${new Date(Date.now() - 400 * DAY).getFullYear()}.\n\n- Giao hàng tự động 24/7\n- Bảo hành đổi mới nhanh\n- Hỗ trợ qua chat trên sàn`,
        policy: 'Bảo hành theo thời gian ghi trên từng sản phẩm. Lỗi do người bán: đổi mới hoặc hoàn tiền. Không bảo hành khi người mua tự đổi thông tin/mật khẩu.',
        defaultWarrantyHours: 48, createdAt: new Date(Date.now() - 190 * DAY),
      },
    });
    await prisma.bankAccount.create({ data: { userId: u.id, bankCode: s.bank, bankName: BANK_NAMES[s.bank], accountNumberEnc: crypto.encryptField(acct, `bank:${u.id}`), accountLast4: acct.slice(-4), holderName: s.full } });
    stores.push({ id: store.id, ownerId: u.id, name: s.name, level: s.level });
  }

  // Sản phẩm
  type P = { store: number; cat: string; title: string; sub: string; md: string; delivery: 'AUTO' | 'MANUAL'; warranty: number; sla?: number; input?: string; format?: string; attrs: Record<string, unknown>; variants: [string, number, number?][]; stock?: number; fmt?: string };
  const P_DEFS: P[] = [
    { store: 0, cat: 'tai-khoan-email', title: 'Gmail cổ 2015 – đã xác minh SĐT, có khôi phục', sub: 'Gmail cổ · Ngâm lâu', md: 'Gmail tạo năm 2015, đã **xác minh số điện thoại**, có email khôi phục.\n\n- Định dạng: `email|password|email khôi phục`\n- Đăng nhập lần đầu nên dùng IP Việt Nam\n- Bảo hành đăng nhập 72 giờ', delivery: 'AUTO', warranty: 72, format: 'email|password|recovery', attrs: { country: 'VN', provider: 'gmail', created_year: 2015, phone_verified: true, has_2fa: false }, variants: [['1 tài khoản', 25000], ['Lô 10 tài khoản', 220000, 10], ['Lô 50 tài khoản', 1000000, 50]], stock: 900, fmt: 'email' },
    { store: 0, cat: 'tai-khoan-email', title: 'Gmail mới 2024 – random IP, giá rẻ', sub: 'Gmail mới · Số lượng lớn', md: 'Gmail mới tạo năm 2024, phù hợp đăng ký dịch vụ hàng loạt.\n\n- Chưa xác minh SĐT\n- Bảo hành 24 giờ', delivery: 'AUTO', warranty: 24, format: 'email|password|recovery', attrs: { country: 'US', provider: 'gmail', created_year: 2024, phone_verified: false, has_2fa: false }, variants: [['1 tài khoản', 6000], ['Lô 100', 500000, 100]], stock: 1500, fmt: 'email' },
    { store: 0, cat: 'tai-khoan-email', title: 'Outlook / Hotmail có 2FA – trust cao', sub: 'Outlook · Bật 2FA', md: 'Tài khoản Outlook đã bật **2FA**, kèm mã khôi phục.\n\nBảo hành 48 giờ.', delivery: 'AUTO', warranty: 48, format: 'email|password|2fa', attrs: { country: 'UK', provider: 'outlook', created_year: 2021, phone_verified: true, has_2fa: true }, variants: [['1 tài khoản', 18000]], stock: 320, fmt: 'email' },
    { store: 1, cat: 'proxy', title: 'Proxy dân cư Việt Nam – xoay IP, 30 ngày', sub: 'Residential VN · 30 ngày', md: 'Proxy dân cư IP Việt Nam (Viettel/VNPT/FPT).\n\n- Hỗ trợ HTTP & SOCKS5\n- Băng thông không giới hạn\n- Định dạng `ip:port:user:pass`', delivery: 'AUTO', warranty: 720, format: 'ip:port:user:pass', attrs: { proxy_type: 'residential', protocol: ['http', 'socks5'], location: 'VN', duration_days: 30 }, variants: [['1 proxy / 30 ngày', 85000], ['Gói 10 proxy', 790000, 10]], stock: 600, fmt: 'proxy' },
    { store: 1, cat: 'proxy', title: 'Proxy datacenter US tốc độ cao – 7 ngày', sub: 'Datacenter US · 1Gbps', md: 'Proxy datacenter Mỹ, ping thấp, phù hợp chạy tool.\n\nBảo hành suốt thời gian sử dụng.', delivery: 'AUTO', warranty: 168, format: 'ip:port:user:pass', attrs: { proxy_type: 'datacenter', protocol: ['http'], location: 'US', duration_days: 7 }, variants: [['1 proxy / 7 ngày', 15000], ['Gói 50 proxy', 650000, 50]], stock: 1200, fmt: 'proxy' },
    { store: 1, cat: 'proxy', title: 'Proxy 4G Việt Nam – IP sạch, đổi IP theo link', sub: '4G Mobile VN', md: 'Proxy 4G mạng Viettel, đổi IP bằng link.\n\nThời hạn 30 ngày.', delivery: 'AUTO', warranty: 720, format: 'ip:port:user:pass', attrs: { proxy_type: 'mobile', protocol: ['http', 'socks5'], location: 'VN', duration_days: 30 }, variants: [['1 cổng / 30 ngày', 290000]], stock: 120, fmt: 'proxy' },
    { store: 1, cat: 'vps', title: 'VPS Windows 4 core 8GB – Singapore', sub: 'VPS 4C/8G · SG', md: 'VPS Windows Server 2022, 4 vCPU, 8GB RAM, SSD 80GB, vị trí Singapore.\n\nBàn giao trong vài giây.', delivery: 'AUTO', warranty: 720, format: 'IP | user | pass', attrs: { cpu: 4, ram_gb: 8, location: 'OTHER' }, variants: [['1 tháng', 390000]], stock: 70, fmt: 'vps' },
    { store: 2, cat: 'tai-khoan-ai', title: 'Gói AI Plus 1 tháng – tài khoản riêng', sub: 'AI Plus · 30 ngày', md: 'Nâng cấp gói AI Plus chính chủ cho tài khoản riêng.\n\n- Thời hạn 30 ngày\n- Bảo hành full thời gian', delivery: 'AUTO', warranty: 720, format: 'email|password', attrs: { country: 'US', service: 'chatgpt', duration_days: 30, plan: 'personal' }, variants: [['1 tháng', 120000]], stock: 140, fmt: 'ai' },
    { store: 2, cat: 'tai-khoan-ai', title: 'Canva Pro 1 năm – mời vào team', sub: 'Canva Pro · 12 tháng', md: 'Mời email của bạn vào team Canva Pro, thời hạn 12 tháng.', delivery: 'AUTO', warranty: 720, format: 'link mời', attrs: { country: 'OTHER', service: 'canva', duration_days: 365, plan: 'shared' }, variants: [['12 tháng', 99000]], stock: 260, fmt: 'ai' },
    { store: 2, cat: 'tai-khoan-ai', title: 'YouTube Premium 6 tháng – gia đình', sub: 'YouTube Premium · Family', md: 'Slot YouTube Premium gói gia đình 6 tháng.', delivery: 'AUTO', warranty: 720, format: 'email|password', attrs: { country: 'VN', service: 'youtube_premium', duration_days: 180, plan: 'family' }, variants: [['6 tháng', 149000]], stock: 90, fmt: 'ai' },
    { store: 2, cat: 'tool-automation', title: 'Tool đăng bài đa nền tảng – bản quyền vĩnh viễn', sub: 'Auto Post Tool', md: 'Tool tự động lên lịch đăng bài nhiều tài khoản, hỗ trợ proxy riêng cho từng tài khoản.\n\nBàn giao: link tải + key kích hoạt.', delivery: 'AUTO', warranty: 168, format: 'link | key', attrs: { os: ['windows', 'macos'], license: 'lifetime' }, variants: [['Bản quyền 1 máy', 450000], ['Bản quyền 3 máy', 1100000]], stock: 110, fmt: 'course' },
    { store: 3, cat: 'key-game', title: 'Key Steam game ngẫu nhiên – có thể trúng AAA', sub: 'Steam Random Key', md: 'Key Steam ngẫu nhiên, đảm bảo game trị giá tối thiểu 50.000đ.', delivery: 'AUTO', warranty: 24, format: 'XXXXX-XXXXX-XXXXX', attrs: { store: 'steam', region: 'global' }, variants: [['1 key', 19000], ['5 key', 85000]], stock: 700, fmt: 'key' },
    { store: 3, cat: 'gift-card', title: 'Thẻ Google Play 100.000đ', sub: 'Google Play 100K', md: 'Mã thẻ Google Play mệnh giá 100.000đ, dùng cho tài khoản Việt Nam.', delivery: 'AUTO', warranty: 24, format: 'mã thẻ', attrs: { brand: 'google_play', face_value: 100000 }, variants: [['1 thẻ', 96000]], stock: 150, fmt: 'key' },
    { store: 3, cat: 'tai-khoan-game', title: 'Tài khoản Liên Quân 50 tướng – nhiều skin', sub: 'Liên Quân · 50 tướng', md: 'Tài khoản Liên Quân Mobile 50 tướng, 30 skin, rank Kim Cương.', delivery: 'AUTO', warranty: 72, format: 'user|pass', attrs: { country: 'VN', game: 'lien_quan', rank: 'Kim Cương' }, variants: [['1 tài khoản', 250000]], stock: 45, fmt: 'mxh' },
    { store: 4, cat: 'thiet-ke', title: 'Thiết kế logo chuyên nghiệp – 3 phương án', sub: 'Logo · 3 concept', md: 'Thiết kế logo theo yêu cầu, **3 phương án** ban đầu, chỉnh sửa tối đa 3 lần.\n\nBàn giao file PNG, SVG, AI.', delivery: 'MANUAL', warranty: 72, sla: 72, input: 'Tên thương hiệu, ngành nghề, màu sắc yêu thích, link tham khảo', attrs: {}, variants: [['Gói cơ bản', 350000], ['Gói nâng cao (kèm bộ nhận diện)', 990000]] },
    { store: 4, cat: 'thiet-ke', title: 'Thiết kế 10 banner quảng cáo Facebook', sub: '10 banner Ads', md: 'Thiết kế 10 banner quảng cáo chuẩn kích thước Facebook/Instagram.', delivery: 'MANUAL', warranty: 48, sla: 48, input: 'Sản phẩm, thông điệp chính, kích thước cần', attrs: {}, variants: [['10 banner', 300000]] },
    { store: 4, cat: 'quang-cao', title: 'Setup chiến dịch quảng cáo TikTok từ A-Z', sub: 'TikTok Ads Setup', md: 'Setup tài khoản quảng cáo, pixel, nhóm đối tượng và 3 mẫu quảng cáo.', delivery: 'MANUAL', warranty: 72, sla: 96, input: 'Link sản phẩm, ngân sách dự kiến/ngày', attrs: { ad_platform: 'tiktok' }, variants: [['Gói setup', 1500000]] },
    { store: 5, cat: 'khoa-hoc-mmo', title: 'Khoá học Affiliate từ con số 0 – 40 bài giảng', sub: 'Khoá học Affiliate', md: 'Khoá học video 40 bài: chọn ngách, làm nội dung, kéo traffic, tối ưu chuyển đổi.\n\nTruy cập trọn đời.', delivery: 'AUTO', warranty: 168, format: 'link | mã kích hoạt', attrs: {}, variants: [['Truy cập trọn đời', 299000]], stock: 400, fmt: 'course' },
    { store: 5, cat: 'source-code', title: 'Source code website bán hàng số – Next.js', sub: 'Source code Next.js', md: 'Source code website bán sản phẩm số, có thanh toán VietQR, trang quản trị.', delivery: 'AUTO', warranty: 168, format: 'link tải', attrs: {}, variants: [['Giấy phép 1 site', 690000]], stock: 80, fmt: 'course' },
  ];
  const products: { id: string; storeIdx: number; delivery: 'AUTO' | 'MANUAL'; variants: { id: string; price: bigint; units: number; name: string }[]; title: string; categoryId: string; warranty: number; sla?: number; image: string }[] = [];
  for (const [i, d] of P_DEFS.entries()) {
    const store = stores[d.store];
    const cat = catIds.get(d.cat)!;
    const img = await saveImage(store.ownerId, 'product', true, productSvg(d.sub, store.name, i));
    const p = await prisma.product.create({
      data: {
        storeId: store.id, categoryId: cat.id, categoryPath: cat.path, slug: slugify(d.title), title: d.title, searchText: toSearchText(d.title, store.name, cat.name),
        descriptionMd: d.md, descriptionHtml: renderMarkdown(d.md), deliveryType: d.delivery, warrantyHours: d.warranty, serviceSlaHours: d.sla ?? null, buyerInputLabel: d.input ?? null,
        stockFormat: d.format ?? null, attrs: d.attrs as Prisma.InputJsonValue, images: [img.url], status: 'ACTIVE', approvedAt: new Date(Date.now() - 100 * DAY),
        priceMin: BigInt(Math.min(...d.variants.map((v) => v[1]))), viewCount: int(200, 5000), createdAt: new Date(Date.now() - int(70, 160) * DAY),
        variants: { create: d.variants.map(([name, price, units], idx) => ({ name, price: BigInt(price), unitsPerPurchase: units ?? 1, sortOrder: idx, maxQty: 500 })) },
      },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (d.delivery === 'AUTO' && d.stock) await addStock(p.id, store.ownerId, d.stock, d.fmt!);
    products.push({ id: p.id, storeIdx: d.store, delivery: d.delivery, variants: p.variants.map((v) => ({ id: v.id, price: v.price, units: v.unitsPerPurchase, name: v.name })), title: p.title, categoryId: cat.id, warranty: d.warranty, sla: d.sla, image: img.url });
  }
  // Một sản phẩm chờ duyệt (cho hàng chờ admin)
  {
    const store = stores[5];
    const cat = catIds.get('khoa-hoc-mmo')!;
    await prisma.product.create({
      data: { storeId: store.id, categoryId: cat.id, categoryPath: cat.path, slug: 'ebook-kiem-tien-tiktok', title: 'Ebook kiếm tiền TikTok Shop 2026', searchText: toSearchText('Ebook kiếm tiền TikTok Shop 2026', store.name), descriptionMd: 'Ebook 120 trang hướng dẫn xây kênh TikTok Shop từ đầu.', descriptionHtml: renderMarkdown('Ebook 120 trang hướng dẫn xây kênh TikTok Shop từ đầu.'), deliveryType: 'AUTO', warrantyHours: 24, attrs: {}, status: 'PENDING_REVIEW', priceMin: 99000n, variants: { create: [{ name: 'Ebook PDF', price: 99000n }] } },
    });
  }

  // Lịch sử đơn hàng 60 ngày
  console.log('→ Đang tạo lịch sử đơn hàng (sổ cái cân đối)...');
  const holdByLevel: Record<string, number> = { NEW: 72, BRONZE: 48, SILVER: 24, GOLD: 12, DIAMOND: 6 };
  let orderCount = 0;
  for (let day = 59; day >= 0; day--) {
    const n = int(4, 9) + Math.floor((60 - day) / 10);
    for (let k = 0; k < n; k++) {
      const p = pick(products);
      const store = stores[p.storeIdx];
      const buyer = pick(buyers);
      // Phần lớn đơn mua gói lẻ để kho không cạn quá nhanh
      const v = rand() < 0.88 ? p.variants[0] : pick(p.variants);
      const qty = p.delivery === 'AUTO' ? int(1, v.units > 1 ? 1 : 3) : 1;
      const total = v.price * BigInt(qty);
      const created = new Date(Date.now() - day * DAY - int(0, 20) * 3600_000 - int(0, 59) * 60_000);
      if (created > new Date()) continue;
      const bal = await prisma.ledgerAccount.findUnique({ where: { key: Acct.available(buyer.id).key } });
      if (!bal || bal.balance < total) await deposit(buyer.id, Number(total) + int(5, 20) * 100_000, new Date(created.getTime() - 3600_000));
      const hold = Math.max(p.warranty, holdByLevel[store.level]);
      const releaseAt = new Date(created.getTime() + hold * 3600_000);
      const roll = rand();
      const disputed = roll < 0.035 && day < 3;
      const refunded = roll >= 0.035 && roll < 0.06;
      const cat = await prisma.category.findUniqueOrThrow({ where: { id: p.categoryId } });
      const units = p.delivery === 'AUTO' ? qty * v.units : qty;
      let status: 'COMPLETED' | 'DELIVERED' | 'DISPUTED' | 'REFUNDED' | 'IN_PROGRESS' | 'PAID' = releaseAt < new Date() ? 'COMPLETED' : 'DELIVERED';
      if (p.delivery === 'MANUAL' && day <= 1) status = day === 0 ? 'PAID' : 'IN_PROGRESS';
      if (refunded) status = 'REFUNDED';
      if (disputed && p.delivery === 'AUTO') status = 'DISPUTED';

      await prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            code: `DH${randomCode(8)}`, buyerId: buyer.id, storeId: store.id, sellerId: store.ownerId, productId: p.id, variantId: v.id, categoryId: p.categoryId,
            status: 'DELIVERED', deliveryType: p.delivery, title: p.title, variantName: v.name, qty, units, unitPrice: v.price, total, feeBps: cat.feeBps,
            warrantyHours: p.warranty, serviceSlaHours: p.sla ?? null, productSnapshot: { title: p.title, variantName: v.name, image: p.image, storeName: store.name, deliveryType: p.delivery },
            idempotencyKey: randomUUID(), deliveredAt: p.delivery === 'AUTO' ? created : new Date(created.getTime() + 20 * 3600_000), createdAt: created,
            acceptedAt: p.delivery === 'MANUAL' ? new Date(created.getTime() + 3600_000) : null,
          },
        });
        await postLedger(tx, { type: 'purchase', refType: 'order', refId: o.id, idempotencyKey: `purchase:${o.id}`, description: `Thanh toán đơn ${o.code}`, createdAt: created, entries: [{ account: Acct.available(buyer.id), side: 'D', amount: total }, { account: Acct.escrow(store.ownerId), side: 'C', amount: total }] });
        if (p.delivery === 'AUTO') {
          const items = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stock_items WHERE "productId" = ${p.id}::uuid AND status = 'AVAILABLE' ORDER BY "createdAt" LIMIT ${units} FOR UPDATE SKIP LOCKED`;
          await tx.stockItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: 'SOLD', orderId: o.id, soldAt: created } });
        }
        await tx.orderEvent.create({ data: { orderId: o.id, type: 'paid', actorId: buyer.id, message: p.delivery === 'AUTO' ? `Đã thanh toán và giao tự động ${units} item` : 'Đã thanh toán', createdAt: created } });
        const escrow = await tx.escrowHold.create({ data: { orderId: o.id, sellerId: store.ownerId, amount: total, releaseAt: status === 'PAID' || status === 'IN_PROGRESS' ? null : releaseAt, createdAt: created } });

        if (status === 'COMPLETED') {
          const fee = (total * BigInt(cat.feeBps)) / 10_000n;
          await postLedger(tx, { type: 'escrow_release', refType: 'order', refId: o.id, idempotencyKey: `release:${o.id}`, description: `Giải ngân đơn ${o.code} (auto)`, createdAt: releaseAt, entries: [{ account: Acct.escrow(store.ownerId), side: 'D', amount: total }, { account: Acct.available(store.ownerId), side: 'C', amount: total - fee }, { account: Acct.fee, side: 'C', amount: fee }] });
          await tx.escrowHold.update({ where: { id: escrow.id }, data: { amount: 0n, status: 'RELEASED', releasedAt: releaseAt } });
          await tx.order.update({ where: { id: o.id }, data: { status: 'COMPLETED', completedAt: releaseAt, feeAmount: fee } });
          await tx.orderEvent.create({ data: { orderId: o.id, type: 'completed', message: 'Hết thời gian bảo hành, tiền đã chuyển cho người bán', createdAt: releaseAt } });
          await tx.store.update({ where: { id: store.id }, data: { completedOrders: { increment: 1 }, soldCount: { increment: qty } } });
          if (rand() < 0.7) {
            const rating = rand() < 0.82 ? 5 : rand() < 0.7 ? 4 : int(1, 3);
            const texts = rating >= 4 ? ['Giao nhanh, hàng đúng mô tả. Sẽ ủng hộ tiếp!', 'Shop uy tín, hỗ trợ nhiệt tình.', 'Đăng nhập ok hết, cảm ơn shop.', 'Giá tốt, chất lượng ổn định.', 'Mua lần thứ 3 rồi, rất hài lòng.'] : ['Có vài cái lỗi nhưng shop đổi nhanh.', 'Giao hơi chậm, chất lượng tạm ổn.', 'Không như mô tả lắm.'];
            await tx.review.create({ data: { orderId: o.id, buyerId: buyer.id, storeId: store.id, productId: p.id, rating, content: pick(texts), createdAt: new Date(releaseAt.getTime() + 3600_000), sellerReply: rand() < 0.5 ? 'Cảm ơn bạn đã ủng hộ shop ❤️' : null, sellerRepliedAt: rand() < 0.5 ? new Date(releaseAt.getTime() + 7200_000) : null } });
          }
        } else if (status === 'REFUNDED') {
          await postLedger(tx, { type: 'refund', refType: 'order', refId: o.id, idempotencyKey: `cancel:${o.id}`, description: `Hoàn tiền đơn ${o.code}`, createdAt: new Date(created.getTime() + 5 * 3600_000), entries: [{ account: Acct.escrow(store.ownerId), side: 'D', amount: total }, { account: Acct.available(buyer.id), side: 'C', amount: total }] });
          await tx.escrowHold.update({ where: { id: escrow.id }, data: { amount: 0n, status: 'REFUNDED', releasedAt: new Date(created.getTime() + 5 * 3600_000) } });
          await tx.order.update({ where: { id: o.id }, data: { status: 'REFUNDED', refundedAmount: total, completedAt: new Date(created.getTime() + 5 * 3600_000) } });
          await tx.store.update({ where: { id: store.id }, data: { disputeCount: { increment: 1 } } });
        } else if (status === 'DISPUTED') {
          const items = await tx.stockItem.findMany({ where: { orderId: o.id }, take: 1 });
          await tx.order.update({ where: { id: o.id }, data: { status: 'DISPUTED' } });
          await tx.escrowHold.update({ where: { id: escrow.id }, data: { status: 'FROZEN' } });
          const d = await tx.dispute.create({ data: { orderId: o.id, openedById: buyer.id, reason: 'LOGIN_FAILED', description: 'Một tài khoản không đăng nhập được, báo sai mật khẩu.', stockItemIds: items.map((i) => i.id), sellerDeadline: new Date(Date.now() + 8 * 3600_000), proposedRefund: total / BigInt(units), status: rand() < 0.5 ? 'OPEN' : 'ESCALATED' } });
          await tx.disputeEvent.create({ data: { disputeId: d.id, actorId: buyer.id, actorRole: 'BUYER', type: 'opened', message: d.description } });
          if (d.status === 'ESCALATED') await tx.disputeEvent.create({ data: { disputeId: d.id, actorId: buyer.id, actorRole: 'BUYER', type: 'escalated', message: 'Người bán chưa xử lý, nhờ admin hỗ trợ.' } });
          await tx.store.update({ where: { id: store.id }, data: { disputeCount: { increment: 1 } } });
        } else if (status === 'PAID' || status === 'IN_PROGRESS') {
          await tx.order.update({ where: { id: o.id }, data: { status, deliveredAt: null, serviceDeadline: status === 'IN_PROGRESS' ? new Date(created.getTime() + (p.sla ?? 48) * 3600_000) : null } });
        }
        await tx.product.update({ where: { id: p.id }, data: { soldCount: { increment: qty } } });
      }, { timeout: 30_000 });
      orderCount++;
    }
  }
  // Cập nhật tồn kho & điểm đánh giá
  for (const p of products) {
    const n = await prisma.stockItem.count({ where: { productId: p.id, status: 'AVAILABLE' } });
    const r = await prisma.review.aggregate({ where: { productId: p.id }, _avg: { rating: true }, _count: true });
    await prisma.product.update({ where: { id: p.id }, data: { stockTotal: n, ratingAvg: Math.round((r._avg.rating ?? 0) * 10) / 10, ratingCount: r._count } });
  }
  for (const s of stores) {
    const r = await prisma.review.aggregate({ where: { storeId: s.id }, _avg: { rating: true }, _count: true });
    await prisma.store.update({ where: { id: s.id }, data: { ratingAvg: Math.round((r._avg.rating ?? 0) * 10) / 10, ratingCount: r._count } });
  }

  // Rút tiền: 2 lệnh đã chuyển, 1 lệnh chờ duyệt
  for (const [i, s] of stores.slice(0, 3).entries()) {
    const bank = await prisma.bankAccount.findFirstOrThrow({ where: { userId: s.ownerId } });
    const amount = BigInt([3_000_000, 5_000_000, 1_500_000][i]);
    const acc = await prisma.ledgerAccount.findUnique({ where: { key: Acct.available(s.ownerId).key } });
    if (!acc || acc.balance < amount) continue;
    await prisma.$transaction(async (tx) => {
      const at = new Date(Date.now() - (i === 2 ? 0.1 : 5 - i) * DAY);
      const w = await tx.withdrawal.create({ data: { code: `RUT${randomCode(8)}`, userId: s.ownerId, bankAccountId: bank.id, amount, status: i === 2 ? 'REQUESTED' : 'PAID', idempotencyKey: randomUUID(), createdAt: at, approvedById: i === 2 ? null : finance.id, approvedAt: i === 2 ? null : at, paidById: i === 2 ? null : admin.id, paidAt: i === 2 ? null : new Date(at.getTime() + 3600_000), bankRef: i === 2 ? null : `FT${int(10000000, 99999999)}` } });
      await postLedger(tx, { type: 'withdraw_request', refType: 'withdrawal', refId: w.id, idempotencyKey: `withdraw:req:${w.id}`, description: `Tạo lệnh rút ${w.code}`, createdAt: at, entries: [{ account: Acct.available(s.ownerId), side: 'D', amount }, { account: Acct.pendingWithdrawal(s.ownerId), side: 'C', amount }] });
      if (i !== 2) await postLedger(tx, { type: 'withdraw_paid', refType: 'withdrawal', refId: w.id, idempotencyKey: `withdraw:paid:${w.id}`, description: `Đã chuyển tiền rút ${w.code}`, createdAt: new Date(at.getTime() + 3600_000), entries: [{ account: Acct.pendingWithdrawal(s.ownerId), side: 'D', amount }, { account: Acct.bank, side: 'C', amount }] });
    });
  }

  // Hồ sơ người bán chờ duyệt
  {
    const u = buyers[7];
    await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: false } });
    const docs = await Promise.all(['CCCD mặt trước', 'CCCD mặt sau', 'Ảnh chân dung'].map((l) => saveImage(u.id, 'kyc', false, docSvg(l))));
    const idNo = '079200001234';
    await prisma.sellerApplication.create({ data: { userId: u.id, storeName: 'Tuấn Minh Digital', storeSlug: 'tuan-minh-digital', description: 'Chuyên tài khoản AI và công cụ thiết kế, giao nhanh 24/7.', fullName: 'BUI TUAN MINH', idNumberHash: crypto.idNumberHash(idNo), idNumberLast4: '1234', idFrontUploadId: docs[0].id, idBackUploadId: docs[1].id, selfieUploadId: docs[2].id, bankCode: '970422', bankName: 'MB Bank', bankAccountEnc: crypto.encryptField('0987654321', `bank:${u.id}`), bankAccountLast4: '4321', bankHolderName: 'BUI TUAN MINH' } });
  }

  // Giao dịch ngân hàng chưa khớp + yêu cầu nạp tay
  await prisma.paymentWebhookEvent.create({ data: { provider: 'sepay', providerTxnId: `seed-${randomUUID()}`, amount: 500000n, content: 'CK NAP TIEN CHO buyer3', payload: { note: 'seed' }, status: 'UNMATCHED' } });
  await prisma.manualDepositClaim.create({ data: { userId: buyers[2].id, amount: 500000n, transferAt: new Date(Date.now() - 3 * 3600_000), note: 'Em chuyển khoản nhưng ghi nhầm nội dung, nhờ admin kiểm tra giúp.' } });

  // Chợ yêu cầu
  console.log('→ Đang tạo bài yêu cầu, bình luận, báo giá, chat...');
  const posts = [
    { by: 0, cat: 'tai-khoan-mxh', title: 'Cần mua 200 tài khoản TikTok tạo trên 1 năm, ưu tiên VN', body: 'Mình cần **200 tài khoản TikTok** tạo trên 1 năm, đã xác minh email.\n\n- Ưu tiên tài khoản Việt Nam\n- Giao dần trong 3 ngày\n- Bảo hành đăng nhập 48h', min: 2_000_000, max: 3_000_000, qty: 200 },
    { by: 1, cat: 'thiet-ke', title: 'Tìm người thiết kế bộ nhận diện cho shop mỹ phẩm', body: 'Cần thiết kế logo + bộ banner cho shop mỹ phẩm online. Phong cách tối giản, màu pastel.', min: 1_000_000, max: 2_500_000, qty: 1 },
    { by: 2, cat: 'proxy', title: 'Cần 50 proxy 4G Việt Nam dùng 3 tháng', body: 'Cần 50 cổng proxy 4G VN, đổi IP qua link, dùng ổn định 3 tháng. Báo giá theo tháng giúp mình.', min: 10_000_000, max: 15_000_000, qty: 50 },
    { by: 3, cat: 'lap-trinh', title: 'Thuê viết tool tự động trả lời tin nhắn fanpage', body: 'Cần tool tự động trả lời tin nhắn fanpage theo kịch bản, có giao diện quản lý đơn giản.', min: 3_000_000, max: 6_000_000, qty: 1 },
    { by: 4, cat: 'tai-khoan-ai', title: 'Cần 20 slot Canva Pro cho team, dùng 1 năm', body: 'Team mình 20 người, cần mời vào Canva Pro 1 năm. Ưu tiên shop có bảo hành.', min: 1_500_000, max: 2_000_000, qty: 20 },
    { by: 5, cat: 'quang-cao', title: 'Nhờ setup quảng cáo Google cho website bán khoá học', body: 'Website bán khoá học online, cần setup chiến dịch Google Search + tracking chuyển đổi.', min: 2_000_000, max: 4_000_000, qty: 1 },
  ];
  const commentsPool = ['Bạn cần tài khoản tạo năm nào ạ?', 'Shop mình có sẵn, đã gửi báo giá nhé.', 'Có yêu cầu gì về bảo hành không bạn?', 'Mình quan tâm, inbox mình qua chat sàn nhé.', 'Giao dần được không hay cần giao một lần?'];
  for (const [i, p] of posts.entries()) {
    const cat = catIds.get(p.cat)!;
    const author = buyers[p.by];
    const created = new Date(Date.now() - int(1, 72) * 3600_000);
    const post = await prisma.requestPost.create({ data: { authorId: author.id, categoryId: cat.id, title: p.title, searchText: toSearchText(p.title, cat.name), bodyMd: p.body, bodyHtml: renderMarkdown(p.body), budgetMin: BigInt(p.min), budgetMax: BigInt(p.max), quantity: p.qty, deadlineAt: new Date(Date.now() + int(2, 10) * DAY), status: 'OPEN', viewCount: int(30, 400), createdAt: created, offerVisibility: i % 2 ? 'PUBLIC' : 'PRIVATE' } });
    let commentCount = 0;
    for (let c = 0; c < int(2, 4); c++) {
      const sellerIdx = int(0, stores.length - 1);
      const root = await prisma.comment.create({ data: { postId: post.id, authorId: stores[sellerIdx].ownerId, body: pick(commentsPool), createdAt: new Date(created.getTime() + (c + 1) * 600_000) } });
      await prisma.comment.update({ where: { id: root.id }, data: { rootId: root.id } });
      commentCount++;
      const replies = int(0, 2);
      for (let r = 0; r < replies; r++) {
        const replier = r % 2 === 0 ? author.id : stores[sellerIdx].ownerId;
        await prisma.comment.create({ data: { postId: post.id, authorId: replier, parentId: root.id, rootId: root.id, depth: 1, replyToUserId: r > 0 ? author.id : null, body: r % 2 === 0 ? 'Mình cần tạo trên 1 năm và có bảo hành 48h nhé.' : 'OK bạn, mình đã cập nhật báo giá.', createdAt: new Date(root.createdAt.getTime() + (r + 1) * 300_000) } });
        commentCount++;
      }
      await prisma.comment.update({ where: { id: root.id }, data: { replyCount: replies, likeCount: int(0, 6) } });
    }
    const offerStores = [...new Set([int(0, 5), int(0, 5), int(0, 5)])];
    for (const si of offerStores) {
      await prisma.offer.create({ data: { postId: post.id, storeId: stores[si].id, sellerId: stores[si].ownerId, price: BigInt(int(p.min / 10_000, p.max / 10_000) * 10_000), deliveryHours: pick([24, 48, 72]), message: `Shop ${stores[si].name} nhận làm, đảm bảo đúng yêu cầu, bảo hành đầy đủ.`, createdAt: new Date(created.getTime() + 3600_000) } });
    }
    await prisma.requestPost.update({ where: { id: post.id }, data: { commentCount, offerCount: offerStores.length } });
  }
  // Bài chờ duyệt
  await prisma.requestPost.create({ data: { authorId: buyers[9].id, categoryId: catIds.get('tai-khoan-email')!.id, title: 'Cần mua gmail số lượng lớn giá tốt', searchText: toSearchText('Cần mua gmail số lượng lớn giá tốt'), bodyMd: 'Cần 1000 gmail, liên hệ zalo 09xx để trao đổi nhanh.', bodyHtml: renderMarkdown('Cần 1000 gmail, liên hệ zalo 09xx để trao đổi nhanh.'), deadlineAt: new Date(Date.now() + 5 * DAY), status: 'PENDING_REVIEW' } });

  // Chat 1-1 & hỗ trợ
  const mkDirect = async (a: string, b: string, ctx: { type: string; id: string; title: string } | null, msgs: [string, string][]) => {
    const conv = await prisma.conversation.create({ data: { type: 'DIRECT', directKey: [a, b].sort().join(':'), contextType: ctx?.type, contextId: ctx?.id, contextTitle: ctx?.title, members: { create: [{ userId: a, role: 'MEMBER' }, { userId: b, role: 'MEMBER', lastReadAt: new Date(Date.now() - DAY) }] } } });
    let t = Date.now() - 3 * 3600_000;
    for (const [sender, body] of msgs) {
      t += 4 * 60_000;
      await prisma.message.create({ data: { conversationId: conv.id, senderId: sender, clientMsgId: randomUUID(), kind: 'TEXT', body, createdAt: new Date(t), flags: /zalo|09\d{8}/i.test(body) ? ['off_platform'] : [] } });
    }
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(t), lastMessagePreview: msgs[msgs.length - 1][1] } });
  };
  await mkDirect(buyers[0].id, stores[0].ownerId, { type: 'product', id: products[0].id, title: products[0].title }, [
    [buyers[0].id, 'Shop ơi gmail cổ còn hàng nhiều không ạ?'],
    [stores[0].ownerId, 'Dạ còn khoảng 900 cái bạn nhé, mua số lượng lớn shop giảm thêm.'],
    [buyers[0].id, 'Mình lấy 50 cái, có bảo hành 72h đúng không shop?'],
    [stores[0].ownerId, 'Đúng rồi bạn, lỗi đăng nhập trong 72h shop đổi mới ngay.'],
  ]);
  await mkDirect(buyers[1].id, stores[4].ownerId, { type: 'post', id: (await prisma.requestPost.findFirstOrThrow({ where: { authorId: buyers[1].id } })).id, title: 'Tìm người thiết kế bộ nhận diện cho shop mỹ phẩm' }, [
    [stores[4].ownerId, 'Chào bạn, mình bên Design Studio, đã gửi báo giá trên bài nhé.'],
    [buyers[1].id, 'Bạn gửi mình xem vài mẫu đã làm được không?'],
    [stores[4].ownerId, 'Bạn kết bạn zalo 0912345678 mình gửi nhanh hơn nhé'],
  ]);
  const supportConv = await prisma.conversation.create({ data: { type: 'SUPPORT', supportTopic: 'deposit', supportStatus: 'QUEUED', members: { create: [{ userId: buyers[2].id, role: 'MEMBER' }] } } });
  await prisma.message.create({ data: { conversationId: supportConv.id, senderId: buyers[2].id, clientMsgId: randomUUID(), kind: 'TEXT', body: 'Em chuyển khoản nạp 500k nhưng ghi nhầm nội dung, nhờ admin kiểm tra giúp em ạ.' } });
  await prisma.conversation.update({ where: { id: supportConv.id }, data: { lastMessagePreview: 'Em chuyển khoản nạp 500k nhưng ghi nhầm nội dung...' } });
  void support;

  // Báo cáo vi phạm
  const offMsg = await prisma.message.findFirst({ where: { flags: { has: 'off_platform' } } });
  if (offMsg) await prisma.report.create({ data: { reporterId: buyers[1].id, targetType: 'MESSAGE', targetId: offMsg.id, reason: 'OFF_PLATFORM', detail: 'Người bán rủ giao dịch qua Zalo.' } });
  await prisma.report.create({ data: { reporterId: buyers[4].id, targetType: 'PRODUCT', targetId: products[13].id, reason: 'SCAM', detail: 'Mô tả 50 tướng nhưng thực tế ít hơn.' } });

  // Thông báo mẫu
  for (const b of buyers.slice(0, 3)) {
    await prisma.notification.create({ data: { userId: b.id, type: 'welcome', title: 'Chào mừng bạn đến MMO Market 👋', body: 'Hãy bật xác thực 2 lớp (2FA) để bảo vệ tài khoản.', link: '/tai-khoan/bao-mat' } });
  }

  console.log(`✔ Seed xong: ${products.length} sản phẩm, ${orderCount} đơn hàng, ${buyers.length} người mua, ${stores.length} gian hàng.`);
  console.log('\nTài khoản demo (mật khẩu chung: ' + DEMO_PASSWORD + '):');
  console.log('  Admin (http://localhost:3001):  admin@mmo.local  | ketoan@mmo.local | ketoan2@mmo.local | cskh@mmo.local | kiemduyet@mmo.local');
  console.log('  Người bán (http://localhost:3000): shopgmail@mmo.local, proxyviet@mmo.local, aitools@mmo.local, keygame@mmo.local, designstudio@mmo.local, mmoacademy@mmo.local');
  console.log('  Người mua: buyer1@mmo.local ... buyer10@mmo.local');
  console.log('  Lần đăng nhập admin/seller đầu tiên sẽ yêu cầu cài 2FA bằng Google Authenticator/Authy.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
