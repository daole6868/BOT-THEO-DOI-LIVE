import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { assertProductionSafety, env } from './config/env';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { RedisIoAdapter } from './modules/chat/redis-io.adapter';

// Tiền là BigInt trong DB; khi trả JSON đổi sang number (giá trị VND luôn < 2^53)
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};

async function bootstrap() {
  assertProductionSafety();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.COOKIE_SECURE ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use(cookieParser());
  // JSON tối đa 1MB; riêng API nhập kho cho phép 6MB. Giữ raw body để xác thực chữ ký webhook.
  const keepRaw = (req: any, _res: unknown, buf: Buffer) => {
    req.rawBody = buf;
  };
  const small: RequestHandler = express.json({ limit: '1mb', verify: keepRaw });
  const big: RequestHandler = express.json({ limit: '6mb', verify: keepRaw });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) =>
    (/^\/api\/seller\/products\/[^/]+\/stock$/.test(req.path) ? big : small)(req, res, next),
  );
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  const io = new RedisIoAdapter(app);
  await io.connectToRedis();
  app.useWebSocketAdapter(io);
  app.enableShutdownHooks();
  await app.listen(env.API_PORT);
  Logger.log(`API đang chạy tại http://localhost:${env.API_PORT}/api`, 'Bootstrap');
}

bootstrap();
