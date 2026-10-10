'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Skeleton, StatusBadge, dateTime, timeAgo } from '@mmo/ui';
import { AlertTriangle, CheckCircle2, EyeOff, HelpCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { api } from '@/lib/api';
import { APP_STATUS } from '@/lib/labels';
import { useRun } from '@/lib/useRun';

const DOC: Record<string, string> = { front: 'CCCD mặt trước', back: 'CCCD mặt sau', selfie: 'Ảnh chân dung' };

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { run, busy } = useRun();
  const { data: a, refetch } = useQuery({ queryKey: ['adm-app', id], queryFn: () => api<any>(`/admin/seller-applications/${id}`), staleTime: Infinity });
  const [decision, setDecision] = useState<null | 'approve' | 'reject' | 'need_info'>(null);
  if (!a) return <Skeleton className="h-96" />;
  const pending = ['PENDING', 'NEED_INFO'].includes(a.status);
  const nameOk = a.fullName.replace(/\s+/g, ' ').trim().toUpperCase() === a.bankHolderName.replace(/\s+/g, ' ').trim().toUpperCase();

  const decide = async (note: string) => {
    const ok = await run(decision!, () => api(`/admin/seller-applications/${id}/decision`, { body: { decision, note: note || undefined } }), decision === 'approve' ? 'Đã duyệt – gian hàng đã được tạo' : 'Đã cập nhật hồ sơ');
    if (ok) {
      setDecision(null);
      qc.invalidateQueries({ queryKey: ['adm-apps'] });
      qc.invalidateQueries({ queryKey: ['queues'] });
      if (decision === 'approve') router.push('/ho-so-ban-hang');
      else refetch();
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/ho-so-ban-hang" className="text-xs text-muted hover:text-fg">← Hồ sơ người bán</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">{a.storeName} <StatusBadge map={APP_STATUS} value={a.status} /></h1>
          <p className="text-sm text-muted">Nộp {dateTime(a.submittedAt)} · @{a.user.username} · tài khoản tạo {timeAgo(a.user.createdAt)}</p>
        </div>
        {pending && (
          <div className="flex flex-wrap gap-2">
            <Button variant="success" onClick={() => setDecision('approve')}><CheckCircle2 className="h-4 w-4" /> Duyệt</Button>
            <Button variant="outline" onClick={() => setDecision('need_info')}><HelpCircle className="h-4 w-4" /> Yêu cầu bổ sung</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setDecision('reject')}><XCircle className="h-4 w-4" /> Từ chối</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Giấy tờ xác minh" subtitle="Ảnh riêng tư, link ký có hạn 10 phút. Việc xem đã được ghi nhật ký." />
          <CardBody>
            {!a.documents.length ? (
              <p className="flex items-center gap-2 text-sm text-muted"><EyeOff className="h-4 w-4" /> Bạn không có quyền xem ảnh KYC (kyc.view).</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {a.documents.map((d: any) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.url} alt={DOC[d.kind]} className="aspect-[4/3] w-full object-cover" />
                    <p className="p-2 text-center text-xs text-muted">{DOC[d.kind]}</p>
                  </a>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Thông tin đối chiếu" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted">Họ tên</dt><dd className="font-semibold">{a.fullName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Số giấy tờ</dt><dd className="font-mono">********{a.idNumberLast4}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Ngân hàng</dt><dd>{a.bankName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Số tài khoản</dt><dd className="font-mono">****{a.bankAccountLast4}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Chủ tài khoản</dt><dd>{a.bankHolderName}</dd></div>
                {a.contact && <div className="flex justify-between gap-3"><dt className="text-muted">Liên hệ</dt><dd>{a.contact}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted">2FA người nộp</dt><dd>{a.user.mfaEnabled ? <Badge tone="success">Đã bật</Badge> : <Badge tone="danger">Chưa bật</Badge>}</dd></div>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Tín hiệu tự động" />
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-center gap-2">{nameOk ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-danger" />} Tên chủ tài khoản {nameOk ? 'trùng' : 'KHÔNG trùng'} họ tên giấy tờ</p>
              <p className="flex items-center gap-2">{a.signals.sameBankCount ? <AlertTriangle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />} {a.signals.sameBankCount ? `${a.signals.sameBankCount} hồ sơ khác dùng cùng tài khoản ngân hàng` : 'Tài khoản ngân hàng chưa xuất hiện ở hồ sơ khác'}</p>
              {a.user.riskFlags.length > 0 && <p className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Cờ rủi ro: {a.user.riskFlags.join(', ')}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Giới thiệu gian hàng" />
            <CardBody className="whitespace-pre-wrap text-sm text-fg2">{a.description}</CardBody>
          </Card>
          {a.reviewNote && <Card className="p-4 text-sm"><p className="text-xs font-semibold text-muted">Ghi chú xét duyệt</p>{a.reviewNote}</Card>}
        </div>
      </div>
      <ReasonModal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? 'Duyệt hồ sơ & mở gian hàng' : decision === 'reject' ? 'Từ chối hồ sơ' : 'Yêu cầu bổ sung thông tin'}
        label={decision === 'approve' ? 'Ghi chú nội bộ' : 'Lý do (gửi cho người nộp)'}
        optional={decision === 'approve'}
        danger={decision === 'reject'}
        confirmText={busy ? 'Đang xử lý…' : 'Xác nhận'}
        onSubmit={decide}
      />
    </div>
  );
}
