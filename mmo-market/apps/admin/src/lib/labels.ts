import type { Tone } from '@mmo/ui';

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  UNVERIFIED: { label: 'Chưa xác minh', tone: 'neutral' },
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  LOCKED: { label: 'Tạm khoá', tone: 'warning' },
  BANNED: { label: 'Cấm vĩnh viễn', tone: 'danger' },
};

export const STORE_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Đang bán', tone: 'success' },
  VACATION: { label: 'Tạm nghỉ', tone: 'neutral' },
  SUSPENDED: { label: 'Bị khoá', tone: 'danger' },
};

export const APP_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  NEED_INFO: { label: 'Cần bổ sung', tone: 'info' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
};

export const REPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Mới', tone: 'warning' },
  ACTIONED: { label: 'Đã xử lý', tone: 'success' },
  DISMISSED: { label: 'Bỏ qua', tone: 'neutral' },
};

export const SUPPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  QUEUED: { label: 'Đang chờ', tone: 'danger' },
  ASSIGNED: { label: 'Đang hỗ trợ', tone: 'info' },
  RESOLVED: { label: 'Đã xong', tone: 'success' },
};

export const ADJ_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
};

export const ACCOUNT_KIND: Record<string, string> = {
  USER_AVAILABLE: 'Ví người dùng',
  USER_PENDING_WITHDRAWAL: 'Chờ rút',
  ESCROW: 'Ký quỹ',
  PLATFORM_BANK: 'Tiền tại ngân hàng sàn',
  PLATFORM_FEE_REVENUE: 'Doanh thu phí',
  PLATFORM_ADJUSTMENT: 'Điều chỉnh',
};

export const REASON_LABEL: Record<string, string> = {
  LOGIN_FAILED: 'Không đăng nhập / dùng được',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  REVOKED: 'Bị thu hồi sau khi giao',
  MISSING: 'Thiếu hàng',
  SERVICE_NOT_DONE: 'Dịch vụ chưa hoàn thành',
  OTHER: 'Khác',
};
