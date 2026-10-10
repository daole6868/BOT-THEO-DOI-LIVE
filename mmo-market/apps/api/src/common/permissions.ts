/** Danh sách quyền của nhân sự sàn. '*' = toàn quyền. */
export const PERMISSIONS = {
  'dashboard.view': 'Xem dashboard',
  'user.view': 'Xem người dùng',
  'user.lock': 'Khoá / mở khoá người dùng',
  'user.mfa_reset': 'Đặt lại 2FA người dùng',
  'seller.review': 'Duyệt hồ sơ người bán',
  'kyc.view': 'Xem ảnh giấy tờ KYC',
  'store.manage': 'Quản lý gian hàng (cấp, phí, tạm khoá)',
  'category.manage': 'Quản lý danh mục & thuộc tính',
  'product.moderate': 'Duyệt / khoá sản phẩm',
  'order.view': 'Xem đơn hàng',
  'stock.view_content': 'Xem nội dung hàng số (khi phân xử)',
  'dispute.resolve': 'Phân xử khiếu nại',
  'deposit.manage': 'Đối soát nạp tiền',
  'adjustment.request': 'Tạo yêu cầu điều chỉnh số dư',
  'adjustment.approve': 'Duyệt điều chỉnh số dư',
  'withdrawal.approve': 'Duyệt lệnh rút',
  'withdrawal.pay': 'Xác nhận đã chuyển tiền rút',
  'ledger.view': 'Xem sổ cái & đối soát',
  'community.moderate': 'Kiểm duyệt bài đăng, bình luận, báo cáo',
  'support.handle': 'Xử lý chat hỗ trợ',
  'audit.view': 'Xem nhật ký kiểm toán',
  'settings.manage': 'Cấu hình hệ thống & công tắc khẩn cấp',
  'staff.manage': 'Quản lý nhân sự & phân quyền',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const DEFAULT_ROLES: { name: string; description: string; permissions: string[] }[] = [
  { name: 'SUPER_ADMIN', description: 'Chủ sàn - toàn quyền', permissions: ['*'] },
  {
    name: 'ADMIN',
    description: 'Quản trị vận hành',
    permissions: [
      'dashboard.view', 'user.view', 'user.lock', 'seller.review', 'kyc.view', 'store.manage', 'category.manage',
      'product.moderate', 'order.view', 'stock.view_content', 'dispute.resolve', 'community.moderate',
      'support.handle', 'audit.view', 'ledger.view',
    ],
  },
  {
    name: 'FINANCE',
    description: 'Kế toán',
    permissions: [
      'dashboard.view', 'user.view', 'order.view', 'deposit.manage', 'adjustment.request', 'adjustment.approve',
      'withdrawal.approve', 'withdrawal.pay', 'ledger.view',
    ],
  },
  {
    name: 'SUPPORT',
    description: 'Chăm sóc khách hàng',
    permissions: ['dashboard.view', 'user.view', 'order.view', 'support.handle', 'dispute.resolve'],
  },
  {
    name: 'MODERATOR',
    description: 'Kiểm duyệt nội dung',
    permissions: ['dashboard.view', 'user.view', 'product.moderate', 'community.moderate', 'seller.review'],
  },
];

export function hasPermission(perms: string[] | undefined | null, needed: string): boolean {
  if (!perms) return false;
  return perms.includes('*') || perms.includes(needed);
}
