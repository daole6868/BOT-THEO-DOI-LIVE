import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Kiểu byte mà Prisma chấp nhận cho cột Bytes. Buffer là lớp con của Uint8Array nên ép kiểu an toàn. */
export type Bytes = Uint8Array<ArrayBuffer>;
export const asBytes = (b: Buffer): Bytes => b as unknown as Bytes;

/** Định dạng: [version=1][nonce 12][tag 16][ciphertext] */
const VERSION = 1;

export function deriveKey(master: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(info), 32));
}

export function aesGcmEncrypt(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), nonce, tag, ct]);
}

export function aesGcmDecrypt(key: Buffer, blob: Buffer, aad: string): Buffer {
  if (blob.length < 29 || blob[0] !== VERSION) throw new Error('Dữ liệu mã hoá không hợp lệ');
  const nonce = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const ct = blob.subarray(29);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function hmacSha256(key: Buffer, data: string | Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** So sánh chuỗi thời gian hằng (chống timing attack). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã ngắn ngẫu nhiên dễ đọc (bỏ ký tự dễ nhầm 0/O/1/I). */
export function randomCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
