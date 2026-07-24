import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function createTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const sslEnabled = config.getOrThrow<boolean>('DB_SSL');

  return {
    type: 'postgres',
    host: config.getOrThrow<string>('DB_HOST'),
    port: config.getOrThrow<number>('DB_PORT'),
    database: config.getOrThrow<string>('DB_NAME'),
    username: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    applicationName: 'taxi-bgr-api',
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    ssl: sslEnabled
      ? {
          rejectUnauthorized: config.getOrThrow<boolean>(
            'DB_SSL_REJECT_UNAUTHORIZED',
          ),
        }
      : false,
    extra: {
      max: config.getOrThrow<number>('DB_POOL_MAX'),
    },
  };
}
