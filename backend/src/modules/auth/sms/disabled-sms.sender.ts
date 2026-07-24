import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SmsSender } from './sms-sender';

@Injectable()
export class DisabledSmsSender implements SmsSender {
  sendCode(): Promise<void> {
    throw new ServiceUnavailableException({
      code: 'SMS_PROVIDER_NOT_CONFIGURED',
      message: 'SMS provider is not configured',
    });
  }
}
