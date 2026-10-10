import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId;

    let status = 500;
    let body: { code: string; message: string; details?: unknown } = {
      code: 'INTERNAL_ERROR',
      message: 'Đã có lỗi xảy ra, vui lòng thử lại',
    };

    if (exception instanceof ZodError) {
      status = 400;
      body = { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: exception.flatten() };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      if (r && typeof r === 'object' && r.code) {
        body = { code: r.code, message: r.message, details: r.details };
      } else {
        const message = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message.join(', ') : r?.message;
        body = { code: status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', message: message || exception.message };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        body = { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại' };
      } else if (exception.code === 'P2025') {
        status = 404;
        body = { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' };
      } else {
        this.logger.error(`[${requestId}] Prisma ${exception.code}: ${exception.message}`);
      }
    } else {
      const err = exception as Error;
      this.logger.error(`[${requestId}] ${err?.message}`, err?.stack);
    }

    res.status(status).json({ error: { ...body, requestId } });
  }
}
