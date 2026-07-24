import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health-indicator';
import { StorageHealthIndicator } from './storage.health-indicator';

@Module({
  imports: [TerminusModule, StorageModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, StorageHealthIndicator],
})
export class HealthModule {}
