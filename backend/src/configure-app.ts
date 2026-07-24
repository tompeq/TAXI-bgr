import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';

export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const config = app.get(ConfigService);
  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(fastifyHelmet);
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      fileSize: 8 * 1024 * 1024,
      fields: 0,
    },
  });
  app.enableCors({
    origin: corsOrigins.length === 0 ? false : corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  if (config.getOrThrow<string>('NODE_ENV') !== 'test') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Taxi Bgr API')
      .setDescription('Passenger, driver and administration API')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }
}
