import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../config/env';
import { CryptoService } from './crypto/crypto.service';
import { Errors } from './errors';
import { PrismaService } from './prisma.service';

export const UPLOAD_PURPOSES = {
  product: { isPublic: true, maxWidth: 1600 },
  avatar: { isPublic: true, maxWidth: 400 },
  banner: { isPublic: true, maxWidth: 1920 },
  review: { isPublic: true, maxWidth: 1600 },
  post: { isPublic: true, maxWidth: 1600 },
  chat: { isPublic: false, maxWidth: 1600 },
  dispute: { isPublic: false, maxWidth: 2000 },
  delivery: { isPublic: false, maxWidth: 2000 },
  receipt: { isPublic: false, maxWidth: 2000 },
  kyc: { isPublic: false, maxWidth: 2000 },
} as const;
export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

const KEY_RE = /^\d{4}\/\d{2}\/[a-f0-9]{32}\.webp$/;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Lưu file trên đĩa (dev). Ảnh luôn được giải mã & mã hoá lại bằng sharp:
 * xoá EXIF/GPS, loại payload ẩn, giới hạn số pixel. Không nhận SVG/HTML.
 */
@Injectable()
export class StorageService {
  private readonly root = path.resolve(env.STORAGE_DIR);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async saveImage(ownerId: string, purpose: UploadPurpose, file: { buffer: Buffer; mimetype: string; size: number }) {
    const cfg = UPLOAD_PURPOSES[purpose];
    if (!cfg) throw Errors.bad('Mục đích tải lên không hợp lệ');
    if (!ALLOWED_MIME.has(file.mimetype)) throw Errors.bad('Chỉ hỗ trợ ảnh JPG, PNG, WEBP, GIF');
    if (file.size > 8 * 1024 * 1024) throw Errors.bad('Ảnh tối đa 8MB');

    let out: { data: Buffer; info: sharp.OutputInfo };
    try {
      out = await sharp(file.buffer, { limitInputPixels: 40_000_000, animated: false })
        .rotate()
        .resize({ width: cfg.maxWidth, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw Errors.bad('File không phải ảnh hợp lệ');
    }

    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(16).toString('hex')}.webp`;
    const dir = path.join(this.root, cfg.isPublic ? 'public' : 'private', path.dirname(key));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(this.root, cfg.isPublic ? 'public' : 'private', key), out.data);

    const upload = await this.prisma.upload.create({
      data: {
        ownerId,
        purpose,
        storageKey: key,
        isPublic: cfg.isPublic,
        mime: 'image/webp',
        size: out.data.length,
        width: out.info.width,
        height: out.info.height,
      },
    });
    return { id: upload.id, key, isPublic: cfg.isPublic, url: this.urlFor(key, cfg.isPublic) };
  }

  urlFor(key: string, isPublic: boolean, ttlSec = 600): string {
    if (isPublic) return `/api/files/p/${key}`;
    const { exp, sig } = this.crypto.signFileUrl(key, ttlSec);
    return `/api/files/s/${key}?exp=${exp}&sig=${sig}`;
  }

  async read(key: string, isPublic: boolean): Promise<Buffer> {
    if (!KEY_RE.test(key)) throw Errors.notFound('File');
    try {
      return await readFile(path.join(this.root, isPublic ? 'public' : 'private', key));
    } catch {
      throw Errors.notFound('File');
    }
  }

  /** Kiểm tra danh sách upload thuộc về người dùng & đúng mục đích. Trả về storage key theo thứ tự. */
  async assertOwned(ownerId: string, ids: string[], purposes: UploadPurpose[]): Promise<{ id: string; key: string; isPublic: boolean }[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.upload.findMany({ where: { id: { in: ids }, ownerId } });
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => {
      const r = map.get(id);
      if (!r || !purposes.includes(r.purpose as UploadPurpose)) throw Errors.bad('Tệp đính kèm không hợp lệ');
      return { id: r.id, key: r.storageKey, isPublic: r.isPublic };
    });
  }

  /** Ảnh riêng tư: tạo URL ký số theo danh sách upload id. */
  async signedUrls(uploadIds: string[]): Promise<{ id: string; url: string }[]> {
    if (!uploadIds.length) return [];
    const rows = await this.prisma.upload.findMany({ where: { id: { in: uploadIds } } });
    return rows.map((r) => ({ id: r.id, url: this.urlFor(r.storageKey, r.isPublic) }));
  }
}
