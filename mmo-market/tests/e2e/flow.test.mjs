// Kiểm thử end-to-end các luồng quan trọng, chạy với API đang hoạt động + dữ liệu seed.
// Chạy: npm run test:e2e   (API_URL mặc định http://localhost:4000)
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const ADMIN = process.env.ADMIN_ORIGIN ?? 'http://localhost:3001';
const PASSWORD = 'MatKhau@2026';

function readEnv(key, fallback) {
  if (process.env[key]) return process.env[key];
  const file = new URL('../../.env', import.meta.url);
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(key + '='));
    if (line) return line.slice(key.length + 1).trim();
  }
  return fallback;
}
const WEBHOOK_SECRET = readEnv('PAYMENT_WEBHOOK_SECRET', 'dev-only-webhook-secret-change-me');

// ---------- TOTP (RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return (((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1_000_000).toString().padStart(6, '0');
}
const lastStep = new Map();
/** Lấy mã TOTP chưa dùng (server chặn dùng lại mã cũ). Chờ nếu cần. */
async function nextCode(secret) {
  for (;;) {
    const now = Math.floor(Date.now() / 30_000);
    const used = lastStep.get(secret) ?? now - 2;
    const step = Math.max(used + 1, now - 1);
    if (step <= now + 1) { lastStep.set(secret, step); return totp(secret, step); }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ---------- HTTP client có cookie jar + CSRF ----------
class Client {
  constructor(origin, area = 'web') { this.origin = origin; this.area = area; this.cookies = new Map(); this.csrf = null; }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method, path, body, headers = {}) {
    if (method !== 'GET' && !this.csrf && !path.startsWith('/api/webhooks')) {
      const r = await this.req('GET', this.area === 'admin' ? '/api/admin/auth/csrf' : '/api/auth/csrf');
      this.csrf = r.body.token;
    }
    const res = await fetch(API + path, {
      method,
      headers: {
        Origin: this.origin,
        Cookie: this.cookieHeader(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' && this.csrf ? { 'X-CSRF-Token': this.csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (!v || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k); else this.cookies.set(k, v);
    }
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}, h) { return this.req('POST', p, b, h); }
}

async function login(email, area = 'web') {
  const c = new Client(area === 'admin' ? ADMIN : WEB, area);
  const r = await c.post(area === 'admin' ? '/api/admin/auth/login' : '/api/auth/login', { login: email, password: PASSWORD });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { c, r: r.body };
}

/** Đăng nhập seller và bật 2FA (bắt buộc với Seller Center). Trả về client + secret. */
async function sellerWithMfa(email) {
  const { c, r } = await login(email);
  let secret;
  if (r.mfaRequired) throw new Error('Seller đã bật 2FA từ lần chạy trước - hãy chạy npm run db:reset');
  const setup = await c.post('/api/auth/mfa/setup', { password: PASSWORD });
  assert.equal(setup.status, 201, JSON.stringify(setup.body));
  secret = setup.body.secret;
  const en = await c.post('/api/auth/mfa/enable', { code: await nextCode(secret) });
  assert.equal(en.status, 201, JSON.stringify(en.body));
  assert.equal(en.body.recoveryCodes.length, 10);
  return { c, secret };
}

const state = {};

test('trang chủ, danh mục, tìm kiếm có facet', async () => {
  const c = new Client(WEB);
  const home = await c.get('/api/home');
  assert.equal(home.status, 200);
  assert.ok(home.body.categories.length >= 5);
  assert.ok(home.body.bestSellers.length > 0);
  const s = await c.get('/api/search/products?category=tai-khoan-email&a.provider=gmail&sort=price_asc');
  assert.equal(s.status, 200);
  assert.ok(s.body.total >= 2);
  const provider = s.body.facets.attributes.find((a) => a.key === 'provider');
  assert.ok(provider.options.find((o) => o.value === 'outlook').count >= 1, 'facet disjunctive phải đếm cả lựa chọn chưa chọn');
  assert.ok(s.body.items.every((i) => i.attrs.provider === 'gmail'));
  const prices = s.body.items.map((i) => i.priceMin);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const q = await c.get('/api/search/products?q=gmail%20co');
  assert.ok(q.body.items.some((i) => i.title.includes('Gmail cổ')), 'tìm không dấu phải ra kết quả có dấu');
});

test('CSRF & phiên: request thay đổi dữ liệu thiếu token bị chặn', async () => {
  const res = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: WEB }, body: JSON.stringify({ login: 'buyer1@mmo.local', password: PASSWORD }) });
  assert.equal(res.status, 403);
  const evil = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(evil.status, 403);
});

test('đăng ký: chưa xác minh email thì không được mua', async (t) => {
  const c = new Client(WEB);
  const email = `e2e_${Date.now()}@example.com`;
  const r = await c.post('/api/auth/register', { email, username: `e2e${Date.now() % 1e8}`, displayName: 'Người test', password: 'MotMatKhauDai#2026' });
  if (r.status === 429) return t.skip('đã chạm giới hạn đăng ký theo IP (5/giờ) - đúng như thiết kế');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const weak = await c.post('/api/auth/register', { email: `w${email}`, username: `w${Date.now() % 1e8}`, displayName: 'Yếu', password: '123' });
  assert.equal(weak.status, 422);
  const l = await c.post('/api/auth/login', { login: email, password: 'MotMatKhauDai#2026' });
  assert.equal(l.status, 201);
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.user.emailVerified, false);
  const o = await c.post('/api/orders', { variantId: randomUUID(), qty: 1 }, { 'Idempotency-Key': randomUUID() });
  assert.equal(o.status, 422);
  assert.equal(o.body.error.code, 'EMAIL_NOT_VERIFIED');
});

test('nạp tiền: giả lập ngân hàng + webhook HMAC idempotent + chữ ký sai bị chặn', async () => {
  const { c } = await login('buyer1@mmo.local');
  state.buyer = c;
  const before = (await c.get('/api/wallet')).body.available;
  const d = await c.post('/api/wallet/deposits', { amount: 2_000_000 }, { 'Idempotency-Key': randomUUID() });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.match(d.body.qr, /^data:image\/png;base64,/);
  const sim = await c.post(`/api/dev/deposits/${d.body.code}/simulate-paid`);
  assert.equal(sim.body.result, 'processed');
  const after = (await c.get('/api/wallet')).body.available;
  assert.equal(after - before, 2_000_000);

  // Webhook generic có chữ ký
  const d2 = await c.post('/api/wallet/deposits', { amount: 300_000 }, { 'Idempotency-Key': randomUUID() });
  const payload = JSON.stringify({ id: `bank-${randomUUID()}`, amount: 300_000, content: `MBVCB ${d2.body.code} chuyen tien`, type: 'in' });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${payload}`).digest('hex');
  const send = (s) => fetch(API + '/api/webhooks/payments/generic', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': s }, body: payload }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const ok = await send(sig);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.result, 'processed');
  const replay = await send(sig);
  assert.equal(replay.body.result, 'duplicate');
  const bad = await send('0'.repeat(64));
  assert.equal(bad.status, 403);
  assert.equal((await c.get('/api/wallet')).body.available - after, 300_000);
});

test('mua hàng tự động: idempotency, nhận hàng giải mã, IDOR bị chặn', async () => {
  const c = state.buyer;
  const s = await c.get('/api/search/products?q=outlook');
  const product = (await c.get(`/api/products/${s.body.items[0].id}`)).body;
  const variant = product.variants[0];
  const key = randomUUID();
  const o1 = await c.post('/api/orders', { variantId: variant.id, qty: 2 }, { 'Idempotency-Key': key });
  assert.equal(o1.status, 201, JSON.stringify(o1.body));
  assert.equal(o1.body.status, 'DELIVERED');
  const o2 = await c.post('/api/orders', { variantId: variant.id, qty: 2 }, { 'Idempotency-Key': key });
  assert.equal(o2.body.code, o1.body.code);
  assert.equal(o2.body.duplicate, true);
  const items = await c.get(`/api/orders/${o1.body.code}/items`);
  assert.equal(items.body.items.length, 2);
  assert.ok(items.body.items[0].content.includes('@'));
  state.order = o1.body.code;

  const { c: other } = await login('buyer2@mmo.local');
  state.buyer2 = other;
  assert.equal((await other.get(`/api/orders/${o1.body.code}`)).status, 404);
  assert.equal((await other.get(`/api/orders/${o1.body.code}/items`)).status, 404);
});

test('race condition: mua song song không bán trùng item, không vượt tồn kho', async () => {
  const c = state.buyer;
  // Chọn sản phẩm giao tự động còn ít hàng nhất để thử "tranh mua"
  const s = await c.get('/api/search/products?inStock=1&delivery=AUTO&pageSize=60');
  const cand = s.body.items.filter((i) => i.stockTotal > 0).sort((a, b) => a.stockTotal - b.stockTotal)[0];
  const p = (await c.get(`/api/products/${cand.id}`)).body;
  // Nạp thêm tiền để lỗi chỉ có thể là hết hàng
  const dep = await c.post('/api/wallet/deposits', { amount: 50_000_000 }, { 'Idempotency-Key': randomUUID() });
  await c.post(`/api/dev/deposits/${dep.body.code}/simulate-paid`);
  let available = Math.floor(p.stockTotal / p.variants[0].unitsPerPurchase);
  assert.ok(available > 0);
  if (available > 10) {
    const bulk = await c.post('/api/orders', { variantId: p.variants[0].id, qty: Math.min(available - 10, p.variants[0].maxQty) }, { 'Idempotency-Key': randomUUID() });
    assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
    available = Math.floor((await c.get(`/api/products/${p.id}`)).body.stockTotal / p.variants[0].unitsPerPurchase);
  }
  const attempts = available + 6;
  const results = await Promise.all(
    Array.from({ length: attempts }, () => c.post('/api/orders', { variantId: p.variants[0].id, qty: 1 }, { 'Idempotency-Key': randomUUID() })),
  );
  const ok = results.filter((r) => r.status === 201);
  const out = results.filter((r) => r.body?.error?.code === 'OUT_OF_STOCK');
  assert.equal(ok.length, available, `chỉ ${available} đơn được thành công`);
  assert.equal(out.length, attempts - available);
  const seen = new Set();
  for (const o of ok) {
    const it = await c.get(`/api/orders/${o.body.code}/items`);
    for (const i of it.body.items) {
      assert.ok(!seen.has(i.id), 'một item bị giao cho 2 đơn');
      seen.add(i.id);
    }
  }
  const after = (await c.get(`/api/products/${p.id}`));
  assert.ok(after.body.stockTotal < p.variants[0].unitsPerPurchase);
});

test('race condition: chi tiêu song song không làm âm số dư', async () => {
  const c = state.buyer2;
  const bal = (await c.get('/api/wallet')).body.available;
  const s = await c.get('/api/search/products?q=proxy%20datacenter');
  const p = (await c.get(`/api/products/${s.body.items[0].id}`)).body;
  const price = p.variants[1]?.price ?? p.variants[0].price;
  const variantId = (p.variants[1] ?? p.variants[0]).id;
  const n = Math.min(25, Math.floor(bal / price) + 5);
  const results = await Promise.all(Array.from({ length: n }, () => c.post('/api/orders', { variantId, qty: 1 }, { 'Idempotency-Key': randomUUID() })));
  const okCount = results.filter((r) => r.status === 201).length;
  const final = (await c.get('/api/wallet')).body.available;
  assert.ok(final >= 0, 'số dư âm!');
  assert.equal(bal - final, okCount * price);
  assert.ok(results.some((r) => r.body?.error?.code === 'INSUFFICIENT_BALANCE' || r.body?.error?.code === 'OUT_OF_STOCK'));
});

test('khiếu nại: người bán hoàn tiền một phần, escrow mở băng', async () => {
  const buyer = state.buyer;
  const order = (await buyer.get(`/api/orders/${state.order}`)).body;
  const before = (await buyer.get('/api/wallet')).body.available;
  const d = await buyer.post(`/api/orders/${state.order}/disputes`, { reason: 'LOGIN_FAILED', description: 'Một tài khoản không đăng nhập được', stockItemIds: [order.itemsMasked[0].id] });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const { c: seller, secret } = await sellerWithMfa('shopgmail@mmo.local');
  state.seller = seller;
  state.sellerSecret = secret;
  const list = await seller.get('/api/seller/disputes?status=OPEN');
  const mine = list.body.find((x) => x.order.code === state.order);
  assert.ok(mine);
  const r = await seller.post(`/api/seller/disputes/${mine.id}/respond`, { action: 'REFUND', message: 'Xin lỗi bạn, shop hoàn tiền item lỗi' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = (await buyer.get('/api/wallet')).body.available;
  assert.equal(after - before, order.total / order.units);
  const o2 = (await buyer.get(`/api/orders/${state.order}`)).body;
  assert.equal(o2.status, 'DELIVERED');
  assert.equal(o2.escrow.status, 'HOLDING');
});

test('xác nhận đơn: giải ngân cho người bán trừ phí sàn', async () => {
  const seller = state.seller;
  const before = (await seller.get('/api/wallet')).body.available;
  const o = (await state.buyer.get(`/api/orders/${state.order}`)).body;
  const c = await state.buyer.post(`/api/orders/${state.order}/confirm`);
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const sd = (await seller.get(`/api/seller/orders/${state.order}`)).body;
  assert.equal(sd.status, 'COMPLETED');
  const remaining = o.total - o.refundedAmount;
  const fee = Math.floor((remaining * sd.feeBps) / 10000);
  const after = (await seller.get('/api/wallet')).body.available;
  assert.equal(after - before, remaining - fee);
  const rv = await state.buyer.post(`/api/orders/${state.order}/review`, { rating: 5, content: 'Shop hỗ trợ nhanh, rất tốt' });
  assert.equal(rv.status, 201);
});

test('chợ yêu cầu: bài đăng, trả lời bình luận, báo giá, chấp nhận thành đơn', async () => {
  const buyer = state.buyer;
  const cats = await buyer.get('/api/categories');
  const catId = cats.body.find((c) => c.slug === 'dich-vu').children[0].id;
  const post = await buyer.post('/api/requests', { title: 'Cần thiết kế logo cho kênh YouTube', categoryId: catId, bodyMd: 'Cần logo đơn giản, hiện đại cho kênh YouTube về công nghệ.', budgetMin: 200000, budgetMax: 500000, deadlineDays: 5 });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  assert.equal(post.body.status, 'OPEN');
  const seller = state.seller;
  const c1 = await seller.post(`/api/requests/${post.body.id}/comments`, { body: 'Bạn thích tông màu nào?' });
  assert.equal(c1.status, 201);
  const c2 = await buyer.post(`/api/requests/${post.body.id}/comments`, { body: '@shopgmail màu xanh dương nhé', parentId: c1.body.id });
  assert.equal(c2.body.depth, 1);
  const c3 = await seller.post(`/api/requests/${post.body.id}/comments`, { body: 'Ok bạn', parentId: c2.body.id });
  assert.equal(c3.body.depth, 1, 'trả lời của trả lời vẫn ở cấp 2');
  assert.equal(c3.body.rootId, c1.body.id);
  assert.equal(c3.body.replyTo.username, 'buyer1');
  const list = await buyer.get(`/api/requests/${post.body.id}/comments`);
  assert.equal(list.body.items[0].replies.length, 2);

  const offer = await seller.post(`/api/requests/${post.body.id}/offers`, { price: 350000, deliveryHours: 48, message: 'Shop nhận thiết kế, 3 phương án, sửa 2 lần.' });
  assert.equal(offer.status, 201, JSON.stringify(offer.body));
  const asOther = await state.buyer2.get(`/api/requests/${post.body.id}/offers`);
  assert.equal(asOther.body.items[0].price, null, 'bài ẩn giá: người ngoài không thấy giá');
  const acc = await buyer.post(`/api/offers/${offer.body.id}/accept`, {}, { 'Idempotency-Key': randomUUID() });
  assert.equal(acc.status, 201, JSON.stringify(acc.body));
  const o = (await buyer.get(`/api/orders/${acc.body.code}`)).body;
  assert.equal(o.status, 'IN_PROGRESS');
  assert.equal(o.total, 350000);
});

test('chat: mở hội thoại, gửi tin, cảnh báo giao dịch ngoài sàn', async () => {
  const buyer = state.buyer;
  const me = (await state.seller.get('/api/auth/me')).body.user;
  const conv = await buyer.post('/api/chat/conversations', { peerUserId: me.id });
  assert.equal(conv.status, 201);
  const m = await buyer.post(`/api/chat/conversations/${conv.body.id}/messages`, { clientMsgId: randomUUID(), kind: 'TEXT', body: 'Shop cho mình xin zalo 0912345678 nhé' });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.ok(m.body.flags.includes('off_platform'));
  const outsider = await state.buyer2.get(`/api/chat/conversations/${conv.body.id}/messages`);
  assert.equal(outsider.status, 404);
});

test('rút tiền: step-up 2FA + PIN, admin duyệt & chuyển, sổ cái vẫn cân', async () => {
  const seller = state.seller;
  const secret = state.sellerSecret;
  const banks = (await seller.get('/api/wallet/bank-accounts')).body;
  assert.ok(banks.length >= 1);
  const step = await seller.post('/api/auth/step-up', { code: await nextCode(secret) });
  assert.equal(step.status, 201, JSON.stringify(step.body));
  const pin = await seller.post('/api/auth/pin', { pin: '246813', password: PASSWORD });
  assert.equal(pin.status, 201, JSON.stringify(pin.body));
  const wrongPin = await seller.post('/api/wallet/withdrawals', { bankAccountId: banks[0].id, amount: 100000, pin: '111222' }, { 'Idempotency-Key': randomUUID() });
  assert.equal(wrongPin.body.error.code, 'PIN_INVALID');
  const w = await seller.post('/api/wallet/withdrawals', { bankAccountId: banks[0].id, amount: 100000, pin: '246813' }, { 'Idempotency-Key': randomUUID() });
  assert.equal(w.status, 201, JSON.stringify(w.body));

  // Admin: lần đầu bắt buộc cài 2FA
  const { c: admin, r } = await login('admin@mmo.local', 'admin');
  assert.equal(r.mfaSetupRequired, true);
  const done = await admin.post('/api/admin/auth/mfa', { challenge: r.challenge, code: await nextCode(r.secret) });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  const dash = await admin.get('/api/admin/dashboard?range=30');
  assert.equal(dash.status, 200);
  assert.ok(dash.body.kpis.gmv.value > 0);
  assert.equal((await admin.post(`/api/admin/finance/withdrawals/${w.body.code}/approve`)).status, 201);
  const paid = await admin.post(`/api/admin/finance/withdrawals/${w.body.code}/mark-paid`, { bankRef: 'FT26101099999' });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  const v = await admin.post('/api/admin/finance/ledger/verify');
  assert.equal(v.body.ok, true, JSON.stringify(v.body.problems));
  const audit = await admin.get('/api/admin/system/audit/verify');
  assert.equal(audit.body.ok, true);

  // Người dùng thường không vào được API admin
  assert.equal((await state.buyer.get('/api/admin/dashboard')).status, 401);
});
