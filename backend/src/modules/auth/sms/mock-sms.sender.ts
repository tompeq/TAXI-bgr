import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms-sender';

@Injectable()
export class MockSmsSender implements SmsSender {
  private readonly logger = new Logger(MockSmsSender.name);

  async sendCode(phone: string, code: string): Promise<void> {
    this.logger.warn(`Mock SMS for ${phone}: ${code}`);
    await Promise.resolve();
  }
}
