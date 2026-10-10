import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { env } from '../../config/env';
import { aesGcmDecrypt, aesGcmEncrypt, asBytes, Bytes, deriveKey, hmacSha256, safeEqual } from './crypto';

/**
 * Mã hoá phong bì (envelope encryption):
 * - KEK suy ra từ MASTER_KEY (ở production nên thay bằng KMS/Vault).
 * - Mỗi lô kho hàng có 1 DEK riêng, DEK được bọc bằng KEK và lưu cùng lô.
 * - Nội dung từng item mã hoá AES-256-GCM với AAD = itemId:productId.
 */
@Injectable()
export class CryptoService {
  private readonly kek: Buffer;
  private readonly fieldKey: Buffer;
  private readonly stockHmacKey: Buffer;
  private readonly idHmacKey: Buffer;
  private readonly urlKey: Buffer;
  private readonly dekCache = new Map<string, { dek: Buffer; exp: number }>();

  /** Trong Nest không có provider MMO_MASTER_KEY -> dùng env. Seed/test có thể truyền khoá trực tiếp. */
  constructor(@Optional() @Inject('MMO_MASTER_KEY') masterKeyBase64: string = env.MASTER_KEY) {
    const master = Buffer.from(masterKeyBase64, 'base64');
    if (master.length !== 32) throw new Error('MASTER_KEY phải dài 32 byte');
    this.kek = deriveKey(master, 'mmo:kek:v1');
    this.fieldKey = deriveKey(master, 'mmo:field:v1');
    this.stockHmacKey = deriveKey(master, 'mmo:stock-hmac:v1');
    this.idHmacKey = deriveKey(master, 'mmo:kyc-id:v1');
    this.urlKey = deriveKey(master, 'mmo:file-url:v1');
  }

  encryptField(value: string, aad: string): Bytes {
    return asBytes(aesGcmEncrypt(this.fieldKey, Buffer.from(value, 'utf8'), `field:${aad}`));
  }

  decryptField(blob: Uint8Array, aad: string): string {
    return aesGcmDecrypt(this.fieldKey, Buffer.from(blob), `field:${aad}`).toString('utf8');
  }

  newDek(): { dek: Buffer; wrapped: Bytes } {
    const dek = randomBytes(32);
    return { dek, wrapped: asBytes(aesGcmEncrypt(this.kek, dek, 'dek:v1')) };
  }

  unwrapDek(wrapped: Uint8Array, cacheKey: string): Buffer {
    const now = Date.now();
    const hit = this.dekCache.get(cacheKey);
    if (hit && hit.exp > now) return hit.dek;
    const dek = aesGcmDecrypt(this.kek, Buffer.from(wrapped), 'dek:v1');
    this.dekCache.set(cacheKey, { dek, exp: now + 5 * 60_000 });
    if (this.dekCache.size > 500) {
      for (const [k, v] of this.dekCache) if (v.exp <= now) this.dekCache.delete(k);
    }
    return dek;
  }

  encryptStock(dek: Buffer, itemId: string, productId: string, content: string): Bytes {
    return asBytes(aesGcmEncrypt(dek, Buffer.from(content, 'utf8'), `stock:${itemId}:${productId}`));
  }

  decryptStock(dek: Buffer, itemId: string, productId: string, blob: Uint8Array): string {
    return aesGcmDecrypt(dek, Buffer.from(blob), `stock:${itemId}:${productId}`).toString('utf8');
  }

  /** Chuẩn hoá rồi HMAC nội dung item để phát hiện trùng mà không cần giải mã. */
  stockHmac(content: string): Buffer {
    const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase();
    return hmacSha256(this.stockHmacKey, normalized);
  }

  idNumberHash(idNumber: string): string {
    return hmacSha256(this.idHmacKey, idNumber.replace(/\s+/g, '')).toString('hex');
  }

  signFileUrl(key: string, ttlSec = 300): { exp: number; sig: string } {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = hmacSha256(this.urlKey, `${key}:${exp}`).toString('base64url');
    return { exp, sig };
  }

  verifyFileUrl(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = hmacSha256(this.urlKey, `${key}:${exp}`).toString('base64url');
    return safeEqual(expected, sig);
  }
}
