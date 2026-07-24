import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StorageService } from './storage.service';

@Injectable()
export class RegistrationUploadsCleanupService {
  private readonly logger = new Logger(RegistrationUploadsCleanupService.name);

  constructor(private readonly storage: StorageService) {}

  @Cron('0 0 4 * * *', { waitForCompletion: true })
  async cleanup(): Promise<void> {
    try {
      await this.storage.cleanupExpiredRegistrationUploads();
    } catch (error) {
      this.logger.error('Could not remove expired registration uploads', error);
    }
  }
}
