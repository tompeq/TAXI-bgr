import 'dotenv/config';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

function trustedProxyCidrs(): string[] | false {
  const cidrs = (process.env.TRUSTED_PROXY_CIDRS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return cidrs.length > 0 ? cidrs : false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 10 * 1024 * 1024,
      trustProxy: trustedProxyCidrs(),
    }),
    {
      bufferLogs: true,
    },
  );
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  await configureApp(app);

  await app.listen(port, '0.0.0.0');
  Logger.log(`Taxi Bgr API is listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
