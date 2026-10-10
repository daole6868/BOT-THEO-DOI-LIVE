import { Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../common/auth.types';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Auth, Public, RateLimit } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { StorageService, UPLOAD_PURPOSES, UploadPurpose } from '../../common/storage.service';

@Controller()
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
  ) {}

  @RateLimit({ name: 'upload', limit: 60, windowSec: 3600, by: 'user' })
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async upload(@Auth() a: AuthContext, @Query('purpose') purpose: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw Errors.bad('Chưa chọn file');
    if (!(purpose in UPLOAD_PURPOSES)) throw Errors.bad('Mục đích tải lên không hợp lệ');
    return this.storage.saveImage(a.user.id, purpose as UploadPurpose, file);
  }

  @Public()
  @Get('files/p/:y/:m/:name')
  async publicFile(@Param('y') y: string, @Param('m') m: string, @Param('name') name: string, @Res() res: Response) {
    const buf = await this.storage.read(`${y}/${m}/${name}`, true);
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buf);
  }

  /** File riêng tư: chỉ mở được bằng URL ký số còn hạn (do API cấp cho người có quyền). */
  @Public()
  @Get('files/s/:y/:m/:name')
  async signedFile(
    @Param('y') y: string,
    @Param('m') m: string,
    @Param('name') name: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() _req: Request,
    @Res() res: Response,
  ) {
    const key = `${y}/${m}/${name}`;
    if (!sig || !this.crypto.verifyFileUrl(key, Number(exp), sig)) throw Errors.notFound('File');
    const buf = await this.storage.read(key, false);
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    res.send(buf);
  }
}
