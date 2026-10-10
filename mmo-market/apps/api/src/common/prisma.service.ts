import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Transaction tương tác với timeout dài hơn mặc định cho nghiệp vụ tiền. */
  tx<T>(fn: (tx: Tx) => Promise<T>, timeoutMs = 20_000): Promise<T> {
    return this.$transaction(fn, { maxWait: 10_000, timeout: timeoutMs, isolationLevel: 'ReadCommitted' });
  }
}
