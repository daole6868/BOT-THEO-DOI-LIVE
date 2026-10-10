/** Nhãn & màu trạng thái dùng thống nhất trong toàn hệ thống. */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: 'Đã thanh toán', tone: 'info' },
  IN_PROGRESS: { label: 'Đang thực hiện', tone: 'warning' },
  DELIVERED: { label: 'Đã giao · Bảo hành', tone: 'primary' },
  DISPUTED: { label: 'Khiếu nại', tone: 'danger' },
  COMPLETED: { label: 'Hoàn tất', tone: 'success' },
  REFUNDED: { label: 'Đã hoàn tiền', tone: 'neutral' },
  CANCELLED: { label: 'Đã huỷ', tone: 'neutral' },
};

export const LEVELS: Record<string, { label: string; icon: string; className: string }> = {
  NEW: { label: 'Mới', icon: '🌱', className: 'bg-subtle text-fg2' },
  BRONZE: { label: 'Đồng', icon: '🥉', className: 'bg-[#f6e3d2] text-[#8a4b16] dark:bg-[#3a2716] dark:text-[#f0b98a]' },
  SILVER: { label: 'Bạc', icon: '🥈', className: 'bg-[#e8ecf2] text-[#475569] dark:bg-[#273244] dark:text-[#cbd5e1]' },
  GOLD: { label: 'Vàng', icon: '🥇', className: 'bg-[#fdf1c7] text-[#8a6100] dark:bg-[#3a2f0f] dark:text-[#fcd34d]' },
  DIAMOND: { label: 'Kim cương', icon: '💎', className: 'bg-[#e0f2fe] text-[#075985] dark:bg-[#0c2f45] dark:text-[#7dd3fc]' },
};

export const DISPUTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Chờ người bán', tone: 'warning' },
  SELLER_RESPONDED: { label: 'Người bán đã phản hồi', tone: 'info' },
  ESCALATED: { label: 'Admin đang phân xử', tone: 'danger' },
  RESOLVED: { label: 'Đã giải quyết', tone: 'success' },
};

export const RESOLUTION: Record<string, string> = {
  REFUND_FULL: 'Hoàn tiền toàn bộ',
  REFUND_PARTIAL: 'Hoàn tiền một phần',
  REPLACED: 'Đã đổi item',
  REJECTED: 'Không chấp nhận khiếu nại',
  WITHDRAWN: 'Người mua rút khiếu nại',
};

export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'warning' },
  ACTIVE: { label: 'Đang bán', tone: 'success' },
  HIDDEN: { label: 'Đang ẩn', tone: 'neutral' },
  REJECTED: { label: 'Bị từ chối', tone: 'danger' },
  BLOCKED: { label: 'Bị khoá', tone: 'danger' },
};

export const WITHDRAWAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Chờ duyệt', tone: 'warning' },
  ON_HOLD: { label: 'Đang giữ lại', tone: 'danger' },
  APPROVED: { label: 'Đã duyệt, chờ chuyển', tone: 'info' },
  PAID: { label: 'Đã chuyển', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã huỷ', tone: 'neutral' },
};

export const DEPOSIT_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ chuyển khoản', tone: 'warning' },
  COMPLETED: { label: 'Thành công', tone: 'success' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
};

export const POST_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'warning' },
  OPEN: { label: 'Đang mở', tone: 'success' },
  FULFILLED: { label: 'Đã chốt', tone: 'primary' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
  EXPIRED: { label: 'Hết hạn', tone: 'neutral' },
  HIDDEN: { label: 'Bị ẩn', tone: 'danger' },
};

export const TXN_TYPES: Record<string, string> = {
  deposit: 'Nạp tiền',
  deposit_manual: 'Nạp tiền (đối soát)',
  purchase: 'Thanh toán đơn hàng',
  refund: 'Hoàn tiền',
  escrow_release: 'Tiền bán hàng',
  withdraw_request: 'Tạo lệnh rút',
  withdraw_reverse: 'Hoàn lệnh rút',
  withdraw_paid: 'Đã chuyển tiền rút',
  adjustment: 'Điều chỉnh số dư',
};
