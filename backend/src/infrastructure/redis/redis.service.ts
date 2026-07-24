import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      connectionName: 'taxi-bgr-api',
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (attempt) => Math.min(attempt * 100, 2000),
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  get connection(): Redis {
    return this.client;
  }
}
