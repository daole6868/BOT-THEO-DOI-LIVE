// Kiểm thử đơn vị cho các thành phần bảo mật lõi (không cần DB/Redis).
// Chạy: npm test  (ở thư mục gốc)
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { aesGcmDecrypt, aesGcmEncrypt, deriveKey, safeEqual } from '../src/common/crypto/crypto';
import { hashPassword, passwordProblems, verifyPassword } from '../src/common/password';
import { detectOffPlatform, maskSecret, renderMarkdown, slugify, unaccent } from '../src/common/text';
import { base32Decode, base32Encode, totpCode, verifyTotp, currentStep } from '../src/common/totp';
import { buildVietQrPayload } from '../src/common/vietqr';

describe('TOTP (RFC 6238)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('khớp vector chuẩn của RFC 6238 (SHA1, T=59s)', () => {
    assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.equal(totpCode(secret, 1), '287082');
    assert.equal(totpCode(secret, 37037036), '081804');
  });

  it('base32 mã hoá / giải mã 2 chiều', () => {
    const buf = randomBytes(20);
    assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  });

  it('chấp nhận mã hiện tại, chặn dùng lại (replay) và mã sai định dạng', () => {
    const step = currentStep();
    const code = totpCode(secret, step);
    assert.equal(verifyTotp(secret, code), step);
    assert.equal(verifyTotp(secret, code, step), null, 'mã của bước đã dùng phải bị từ chối');
    assert.equal(verifyTotp(secret, '12345'), null);
    assert.equal(verifyTotp(secret, 'abcdef'), null);
  });
});

describe('Mã hoá AES-256-GCM', () => {
  const key = deriveKey(randomBytes(32), 'test:key');

  it('giải mã đúng với cùng AAD', () => {
    const blob = aesGcmEncrypt(key, Buffer.from('user@gmail.com|Pass123'), 'item:1');
    assert.equal(aesGcmDecrypt(key, blob, 'item:1').toString(), 'user@gmail.com|Pass123');
  });

  it('mỗi lần mã hoá cho bản mã khác nhau (IV ngẫu nhiên)', () => {
    const a = aesGcmEncrypt(key, Buffer.from('x'), 'aad');
    const b = aesGcmEncrypt(key, Buffer.from('x'), 'aad');
    assert.notDeepEqual(a, b);
  });

  it('từ chối khi sai AAD (chống tráo dữ liệu giữa các item)', () => {
    const blob = aesGcmEncrypt(key, Buffer.from('secret'), 'item:1');
    assert.throws(() => aesGcmDecrypt(key, blob, 'item:2'));
  });

  it('từ chối khi bản mã bị sửa 1 byte', () => {
    const blob = aesGcmEncrypt(key, Buffer.from('secret'), 'aad');
    blob[blob.length - 1] ^= 1;
    assert.throws(() => aesGcmDecrypt(key, blob, 'aad'));
  });

  it('khoá dẫn xuất khác nhau theo ngữ cảnh', () => {
    const master = randomBytes(32);
    assert.notDeepEqual(deriveKey(master, 'a'), deriveKey(master, 'b'));
  });

  it('so sánh chuỗi an toàn thời gian', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false);
  });
});

describe('Mật khẩu (argon2id + pepper)', () => {
  const pepper = randomBytes(32);

  it('băm và xác minh', async () => {
    const h = await hashPassword('Rat-Kho-Doan#2026', pepper);
    assert.match(h, /^\$argon2id\$/);
    assert.equal(await verifyPassword(h, 'Rat-Kho-Doan#2026').catch(() => false), false, 'thiếu đúng pepper thì không khớp');
  });

  it('phát hiện mật khẩu yếu hoặc chứa thông tin cá nhân', () => {
    assert.ok(passwordProblems('123'));
    assert.ok(passwordProblems('nguyenvana2026!', 'nguyenvana'));
    assert.equal(passwordProblems('Mua-Ban-An-Toan#2026', 'buyer1@mmo.local', 'buyer1'), null);
  });
});

describe('Nội dung người dùng', () => {
  it('Markdown không cho phép script / javascript:', () => {
    const html = renderMarkdown('Xin chào <script>alert(1)</script> [bấm](javascript:alert(1)) <img src=x onerror=alert(1)>');
    assert.doesNotMatch(html, /<script|<img|<[^>]*\s(on\w+|href="javascript)/i);
    assert.match(html, /&lt;script&gt;/, "thẻ bị escape thành văn bản");
  });

  it('link luôn có rel nofollow/noopener', () => {
    const html = renderMarkdown('[web](https://example.com)');
    assert.match(html, /rel="[^"]*nofollow/);
  });

  it('phát hiện rủ giao dịch ngoài sàn', () => {
    assert.equal(detectOffPlatform('Ib zalo 0901234567 mình bớt giá'), true);
    assert.equal(detectOffPlatform('Chuyển khoản riêng cho mình nhé'), true);
    assert.equal(detectOffPlatform('Sản phẩm dùng tốt, giao nhanh'), false);
  });

  it('che nội dung hàng số và tạo slug không dấu', () => {
    assert.equal(maskSecret('abcdefgh'), 'abc•••••');
    assert.equal(slugify('Tài khoản Gmail cổ'), 'tai-khoan-gmail-co');
    assert.equal(unaccent('Đặng Văn Long'), 'Dang Van Long');
  });
});

describe('VietQR (EMVCo)', () => {
  const crc16 = (s: string) => {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  };

  it('payload có BIN ngân hàng, số tiền, nội dung và CRC hợp lệ', () => {
    const p = buildVietQrPayload({ bankBin: '970422', accountNo: '0000123456789', amount: 150000, addInfo: 'NAPABC12345' });
    assert.ok(p.startsWith('000201'));
    assert.match(p, /970422/);
    assert.match(p, /5406150000/);
    assert.match(p, /NAPABC12345/);
    assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  });
});
