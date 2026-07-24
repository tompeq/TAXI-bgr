import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class StorageHealthIndicator {
  constructor(
    private readonly healthIndicator: HealthIndicatorService,
    private readonly storage: StorageService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicator.check(key);
    const startedAt = performance.now();

    try {
      await this.storage.checkAvailability();
      return indicator.up({
        latencyMs: Math.round(performance.now() - startedAt),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Storage error';
      return indicator.down({ message });
    }
  }
}
