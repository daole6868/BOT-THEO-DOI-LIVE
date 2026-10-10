import { HttpException, HttpStatus } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  unauthorized: () => new AppError('UNAUTHORIZED', 'Bạn cần đăng nhập', 401),
  forbidden: (msg = 'Bạn không có quyền thực hiện thao tác này') => new AppError('FORBIDDEN', msg, 403),
  notFound: (what = 'Dữ liệu') => new AppError('NOT_FOUND', `${what} không tồn tại`, 404),
  conflict: (code: string, msg: string) => new AppError(code, msg, 409),
  business: (code: string, msg: string, details?: unknown) => new AppError(code, msg, 422, details),
  bad: (msg: string, details?: unknown) => new AppError('BAD_REQUEST', msg, 400, details),
  rateLimited: (retryAfter: number) =>
    new AppError('RATE_LIMITED', `Bạn thao tác quá nhanh, thử lại sau ${retryAfter} giây`, 429, { retryAfter }),
  mfaRequired: () => new AppError('MFA_REQUIRED', 'Vui lòng xác thực lại bằng mã 2FA', 403),
  mfaSetupRequired: () => new AppError('MFA_SETUP_REQUIRED', 'Bạn cần bật xác thực 2 lớp (2FA) trước', 403),
  killSwitch: (feature: string) =>
    new AppError('FEATURE_DISABLED', `Chức năng ${feature} đang tạm dừng để bảo trì`, 503),
};
