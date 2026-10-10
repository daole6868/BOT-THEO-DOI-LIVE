import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto/crypto.service';
import { KeywordsService } from './keywords.service';
import { MailService } from './mail.service';
import { NotificationsService } from './notifications.service';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit.service';
import { RealtimeService } from './realtime.service';
import { RedisService } from './redis.service';
import { SessionService } from './session.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

const providers = [
  PrismaService,
  RedisService,
  CryptoService,
  SettingsService,
  AuditService,
  MailService,
  KeywordsService,
  RealtimeService,
  RateLimitService,
  SessionService,
  StorageService,
  NotificationsService,
];

@Global()
@Module({ providers, exports: providers })
export class CommonModule {}
