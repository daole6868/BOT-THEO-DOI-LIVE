import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (e) {
      const where = (process.env.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//').split('?')[0];
      new Logger('Database').error(
        `Không kết nối được PostgreSQL (${where}).\n` +
          '  → Cách nhanh nhất: dừng lệnh này rồi chạy "npm run quick" (tự bật PostgreSQL kèm theo, không cần cài gì thêm).\n' +
          '  → Hoặc bật PostgreSQL của bạn và kiểm tra DATABASE_URL trong file .env',
      );
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Transaction tương tác với timeout dài hơn mặc định cho nghiệp vụ tiền. */
  tx<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 20_000): Promise<T> {
    return this.$transaction(fn, { maxWait: 10_000, timeout: timeoutMs, isolationLevel: 'ReadCommitted' });
  }
}
