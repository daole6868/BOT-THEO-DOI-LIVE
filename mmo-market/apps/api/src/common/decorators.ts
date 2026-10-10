import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext } from './auth.types';

export const IS_PUBLIC = 'mmo:public';
export const IS_ADMIN_AREA = 'mmo:admin';
export const PERMISSIONS = 'mmo:perms';
export const STEP_UP = 'mmo:stepup';
export const SELLER_ONLY = 'mmo:seller';
export const ALLOW_UNVERIFIED = 'mmo:unverified';
export const RATE_LIMITS = 'mmo:ratelimits';

/** Không cần đăng nhập (vẫn nhận diện người dùng nếu có phiên). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Khu vực admin: dùng cookie phiên admin, bắt buộc là nhân sự. */
export const AdminArea = () => SetMetadata(IS_ADMIN_AREA, true);
/** Yêu cầu quyền cụ thể (nhân sự). */
export const Perm = (...perms: string[]) => SetMetadata(PERMISSIONS, perms);
/** Yêu cầu xác thực lại 2FA trong 10 phút gần nhất. */
export const StepUp = () => SetMetadata(STEP_UP, true);
/** Chỉ chủ gian hàng (đã bật 2FA). */
export const SellerOnly = () => SetMetadata(SELLER_ONLY, true);
/** Cho phép tài khoản chưa xác minh email. */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSec: number;
  by?: 'ip' | 'user';
}
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMITS, rules);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest().auth;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.ip ?? '';
});
