import { Injectable } from '@nestjs/common';
import type { Store } from '@prisma/client';
import { env } from '../../config/env';
import { AuditService } from '../../common/audit.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Errors } from '../../common/errors';
import { MailService } from '../../common/mail.service';
import { NotificationsService } from '../../common/notifications.service';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';
import { StorageService } from '../../common/storage.service';
import { slugify, unaccent } from '../../common/text';
import type { AuthContext } from '../../common/auth.types';

export const BANKS: Record<string, string> = {
  '970422': 'MB Bank', '970436': 'Vietcombank', '970415': 'VietinBank', '970418': 'BIDV', '970405': 'Agribank',
  '970407': 'Techcombank', '970416': 'ACB', '970432': 'VPBank', '970423': 'TPBank', '970403': 'Sacombank',
  '970437': 'HDBank', '970441': 'VIB', '970443': 'SHB', '970448': 'OCB', '970426': 'MSB', '970431': 'Eximbank',
  '970454': 'Viet Capital Bank', '970429': 'SCB', '970440': 'SeABank', '970449': 'LPBank', '970452': 'KienlongBank',
  '970409': 'Bac A Bank', '970412': 'PVcomBank', '970425': 'ABBANK', '970427': 'VietABank', '970428': 'Nam A Bank',
  '970430': 'PGBank', '970433': 'VietBank', '970438': 'BaoViet Bank', '970400': 'Saigonbank', '971005': 'Viettel Money',
  '971011': 'VNPT Money', '963388': 'Timo', '970458': 'UOB', '970424': 'Shinhan Bank',
};

export const normName = (s: string) => unaccent(s).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();

export interface ApplicationInput {
  storeName: string;
  storeSlug?: string;
  mainCategoryId?: string;
  description: string;
  contact?: string;
  fullName: string;
  idNumber: string;
  idFrontUploadId: string;
  idBackUploadId: string;
  selfieUploadId: string;
  bankCode: string;
  bankAccount: string;
  bankHolderName: string;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
  ) {}

  // ---------------- Công khai ----------------

  async publicStore(slug: string, viewerId?: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      include: { owner: { select: { id: true, username: true, displayName: true, avatarUrl: true, createdAt: true } } },
    });
    if (!store || store.status === 'SUSPENDED') throw Errors.notFound('Gian hàng');
    const [productCount, following, online, ratingDist] = await Promise.all([
      this.prisma.product.count({ where: { storeId: store.id, status: 'ACTIVE', deletedAt: null } }),
      viewerId ? this.prisma.storeFollower.findUnique({ where: { storeId_userId: { storeId: store.id, userId: viewerId } } }) : null,
      this.redis.client.exists(`presence:${store.ownerId}`),
      this.prisma.review.groupBy({ by: ['rating'], where: { storeId: store.id, status: 'VISIBLE' }, _count: true }),
    ]);
    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      policy: store.policy,
      avatarUrl: store.avatarUrl,
      bannerUrl: store.bannerUrl,
      level: store.level,
      status: store.status,
      vacationUntil: store.vacationUntil,
      defaultWarrantyHours: store.defaultWarrantyHours,
      ratingAvg: store.ratingAvg,
      ratingCount: store.ratingCount,
      soldCount: store.soldCount,
      completedOrders: store.completedOrders,
      followerCount: store.followerCount,
      disputeRatePct: store.completedOrders ? Math.round((store.disputeCount / store.completedOrders) * 1000) / 10 : 0,
      productCount,
      createdAt: store.createdAt,
      owner: store.owner,
      online: online === 1,
      following: !!following,
      ratingDistribution: Object.fromEntries(ratingDist.map((r) => [r.rating, r._count])),
    };
  }

  async topStores(limit = 8) {
    return this.prisma.store.findMany({
      where: { status: { not: 'SUSPENDED' } },
      orderBy: [{ completedOrders: 'desc' }, { ratingAvg: 'desc' }],
      take: limit,
      select: { slug: true, name: true, avatarUrl: true, level: true, ratingAvg: true, ratingCount: true, completedOrders: true, soldCount: true },
    });
  }

  async follow(slug: string, userId: string, on: boolean) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw Errors.notFound('Gian hàng');
    if (store.ownerId === userId) throw Errors.bad('Không thể tự theo dõi gian hàng của mình');
    if (on) {
      const created = await this.prisma.storeFollower.createMany({ data: [{ storeId: store.id, userId }], skipDuplicates: true });
      if (created.count) await this.prisma.store.update({ where: { id: store.id }, data: { followerCount: { increment: 1 } } });
    } else {
      const del = await this.prisma.storeFollower.deleteMany({ where: { storeId: store.id, userId } });
      if (del.count) await this.prisma.store.update({ where: { id: store.id }, data: { followerCount: { decrement: 1 } } });
    }
    return { following: on };
  }

  async storeReviews(slug: string, page: number, pageSize: number) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw Errors.notFound('Gian hàng');
    const where = { storeId: store.id, status: 'VISIBLE' as const };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { select: { title: true, buyer: { select: { displayName: true, avatarUrl: true } } } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id, rating: r.rating, content: r.content, sellerReply: r.sellerReply, createdAt: r.createdAt,
        productTitle: r.order.title,
        buyer: { displayName: r.order.buyer.displayName.slice(0, 2) + '***', avatarUrl: r.order.buyer.avatarUrl },
      })),
      total, page, pageSize,
    };
  }

  // ---------------- Seller: cài đặt gian hàng ----------------

  async updateStore(a: AuthContext, input: { description?: string; policy?: string; avatarUploadId?: string | null; bannerUploadId?: string | null; defaultWarrantyHours?: number }) {
    const data: Partial<Store> = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.policy !== undefined) data.policy = input.policy;
    if (input.defaultWarrantyHours !== undefined) data.defaultWarrantyHours = input.defaultWarrantyHours;
    if (input.avatarUploadId) {
      const [u] = await this.storage.assertOwned(a.user.id, [input.avatarUploadId], ['avatar']);
      data.avatarUrl = this.storage.urlFor(u.key, true);
    } else if (input.avatarUploadId === null) data.avatarUrl = null;
    if (input.bannerUploadId) {
      const [u] = await this.storage.assertOwned(a.user.id, [input.bannerUploadId], ['banner']);
      data.bannerUrl = this.storage.urlFor(u.key, true);
    } else if (input.bannerUploadId === null) data.bannerUrl = null;
    return this.prisma.store.update({ where: { id: a.store!.id }, data });
  }

  async setVacation(a: AuthContext, until: Date | null) {
    const store = a.store!;
    if (store.status === 'SUSPENDED') throw Errors.forbidden('Gian hàng đang bị tạm khoá');
    if (until && until.getTime() < Date.now()) throw Errors.bad('Ngày quay lại phải ở tương lai');
    return this.prisma.store.update({
      where: { id: store.id },
      data: until ? { status: 'VACATION', vacationUntil: until } : { status: 'ACTIVE', vacationUntil: null },
    });
  }

  // ---------------- Đăng ký bán hàng (KYC) ----------------

  async apply(a: AuthContext, input: ApplicationInput) {
    const user = a.user;
    if (user.isStaff) throw Errors.forbidden('Tài khoản nhân sự không được mở gian hàng (tránh xung đột lợi ích)');
    if (!user.mfaEnabled) throw Errors.mfaSetupRequired();
    if (await this.prisma.store.findUnique({ where: { ownerId: user.id } })) throw Errors.bad('Bạn đã có gian hàng');
    const existing = await this.prisma.sellerApplication.findUnique({ where: { userId: user.id } });
    if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) throw Errors.bad('Hồ sơ của bạn đang được xử lý');
    if (existing?.status === 'REJECTED' && existing.reviewedAt && Date.now() - existing.reviewedAt.getTime() < 24 * 3600_000) {
      throw Errors.business('REAPPLY_TOO_SOON', 'Bạn có thể nộp lại hồ sơ sau 24 giờ kể từ lần bị từ chối');
    }
    if (!BANKS[input.bankCode]) throw Errors.bad('Ngân hàng không hợp lệ');
    if (normName(input.bankHolderName) !== normName(input.fullName)) {
      throw Errors.business('BANK_NAME_MISMATCH', 'Tên chủ tài khoản ngân hàng phải trùng với họ tên trên giấy tờ');
    }
    const slug = slugify(input.storeSlug || input.storeName, 40);
    if (await this.prisma.store.findUnique({ where: { slug } })) throw Errors.conflict('SLUG_TAKEN', 'Địa chỉ gian hàng đã có người dùng');
    const idNumber = input.idNumber.replace(/\s+/g, '');
    const idHash = this.crypto.idNumberHash(idNumber);
    const dupId = await this.prisma.sellerApplication.findFirst({ where: { idNumberHash: idHash, userId: { not: user.id }, status: { in: ['PENDING', 'APPROVED', 'NEED_INFO'] } } });
    if (dupId) throw Errors.business('ID_ALREADY_USED', 'Giấy tờ này đã được dùng cho một gian hàng khác');
    await this.storage.assertOwned(user.id, [input.idFrontUploadId, input.idBackUploadId, input.selfieUploadId], ['kyc']);

    const data = {
      storeName: input.storeName,
      storeSlug: slug,
      mainCategoryId: input.mainCategoryId ?? null,
      description: input.description,
      contact: input.contact,
      fullName: input.fullName.trim(),
      idNumberHash: idHash,
      idNumberLast4: idNumber.slice(-4),
      idFrontUploadId: input.idFrontUploadId,
      idBackUploadId: input.idBackUploadId,
      selfieUploadId: input.selfieUploadId,
      bankCode: input.bankCode,
      bankName: BANKS[input.bankCode],
      bankAccountEnc: this.crypto.encryptField(input.bankAccount, `bank:${user.id}`),
      bankAccountLast4: input.bankAccount.slice(-4),
      bankHolderName: normName(input.bankHolderName),
      status: 'PENDING' as const,
      reviewNote: null,
      reviewerId: null,
      reviewedAt: null,
      submittedAt: new Date(),
    };
    const app = await this.prisma.sellerApplication.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    return this.serializeApplication(app);
  }

  async myApplication(userId: string) {
    const app = await this.prisma.sellerApplication.findUnique({ where: { userId } });
    return app ? this.serializeApplication(app) : null;
  }

  serializeApplication(app: any) {
    const { bankAccountEnc, idNumberHash, ...rest } = app;
    return rest;
  }

  // ---------------- Admin duyệt hồ sơ ----------------

  async adminList(status: string | undefined, page: number, pageSize: number) {
    const where = status ? { status: status as any } : {};
    const [items, total] = await Promise.all([
      this.prisma.sellerApplication.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, username: true, email: true, displayName: true, createdAt: true, riskFlags: true } } },
      }),
      this.prisma.sellerApplication.count({ where }),
    ]);
    return { items: items.map((i) => this.serializeApplication(i)), total, page, pageSize };
  }

  async adminDetail(id: string, staff: AuthContext, canViewKyc: boolean) {
    const app = await this.prisma.sellerApplication.findUnique({
      where: { id },
      include: { user: { select: { id: true, username: true, email: true, displayName: true, createdAt: true, riskFlags: true, mfaEnabled: true } } },
    });
    if (!app) throw Errors.notFound('Hồ sơ');
    const sameBank = await this.prisma.sellerApplication.count({ where: { bankAccountLast4: app.bankAccountLast4, bankCode: app.bankCode, id: { not: app.id } } });
    let documents: { id: string; kind: 'front' | 'back' | 'selfie'; url: string }[] = [];
    if (canViewKyc) {
      const urls = new Map((await this.storage.signedUrls([app.idFrontUploadId, app.idBackUploadId, app.selfieUploadId])).map((u) => [u.id, u.url]));
      const order = [['front', app.idFrontUploadId], ['back', app.idBackUploadId], ['selfie', app.selfieUploadId]] as const;
      documents = order.filter(([, id]) => urls.has(id)).map(([kind, id]) => ({ id, kind, url: urls.get(id)! }));
      await this.audit.log({ actorId: staff.user.id, ip: staff.ip, userAgent: staff.userAgent, action: 'kyc.view', targetType: 'seller_application', targetId: app.id });
    }
    return { ...this.serializeApplication(app), documents, signals: { sameBankCount: sameBank } };
  }

  async adminDecide(id: string, staff: AuthContext, decision: 'approve' | 'reject' | 'need_info', note?: string) {
    const app = await this.prisma.sellerApplication.findUnique({ where: { id }, include: { user: true } });
    if (!app) throw Errors.notFound('Hồ sơ');
    if (!['PENDING', 'NEED_INFO'].includes(app.status)) throw Errors.bad('Hồ sơ đã được xử lý');
    if (decision !== 'approve' && !note) throw Errors.bad('Vui lòng nhập lý do');

    if (decision === 'approve') {
      let slug = app.storeSlug;
      if (await this.prisma.store.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      await this.prisma.$transaction(async (tx) => {
        await tx.store.create({ data: { ownerId: app.userId, slug, name: app.storeName, description: app.description } });
        const acct = this.crypto.decryptField(app.bankAccountEnc, `bank:${app.userId}`);
        await tx.bankAccount.create({
          data: {
            userId: app.userId,
            bankCode: app.bankCode,
            bankName: app.bankName,
            accountNumberEnc: this.crypto.encryptField(acct, `bank:${app.userId}`),
            accountLast4: app.bankAccountLast4,
            holderName: app.bankHolderName,
          },
        });
        await tx.sellerApplication.update({ where: { id }, data: { status: 'APPROVED', reviewerId: staff.user.id, reviewedAt: new Date(), reviewNote: note } });
        await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: 'seller.approve', targetType: 'seller_application', targetId: id, reason: note }, tx);
      });
      await this.notify.notify(app.userId, { type: 'seller.approved', title: 'Gian hàng của bạn đã được duyệt 🎉', body: 'Bạn có thể bắt đầu đăng sản phẩm.', link: '/seller' });
      this.mail.send(app.user.email, 'Gian hàng đã được duyệt', ['Chúc mừng! Hồ sơ người bán của bạn đã được duyệt.'], { label: 'Vào Seller Center', url: `${env.WEB_ORIGIN}/seller` });
    } else {
      const status = decision === 'reject' ? 'REJECTED' : 'NEED_INFO';
      await this.prisma.sellerApplication.update({ where: { id }, data: { status, reviewerId: staff.user.id, reviewedAt: new Date(), reviewNote: note } });
      await this.audit.log({ actorId: staff.user.id, ip: staff.ip, action: `seller.${decision}`, targetType: 'seller_application', targetId: id, reason: note });
      await this.notify.notify(app.userId, {
        type: `seller.${decision}`,
        title: decision === 'reject' ? 'Hồ sơ người bán bị từ chối' : 'Hồ sơ người bán cần bổ sung',
        body: note,
        link: '/tai-khoan/dang-ky-ban-hang',
      });
    }
    return { ok: true };
  }
}
