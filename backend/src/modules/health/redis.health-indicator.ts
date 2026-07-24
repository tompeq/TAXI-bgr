import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    private readonly redis: RedisService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicator.check(key);
    const startedAt = performance.now();

    try {
      await this.redis.ping();
      return indicator.up({
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Redis error';
      return indicator.down({ message });
    }
  }
}
