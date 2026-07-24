import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { RedisHealthIndicator } from './redis.health-indicator';
import { StorageHealthIndicator } from './storage.health-indicator';

@ApiTags('system')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly storage: StorageHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check API dependencies' })
  check() {
    return this.health.check([
      () => this.database.pingCheck('database', { timeout: 1500 }),
      () => this.redis.isHealthy('redis'),
      () => this.storage.isHealthy('storage'),
    ]);
  }
}
