import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms-sender';

const SMSPILOT_API_URL = 'https://smspilot.ru/api.php';
const SMSPILOT_REQUEST_TIMEOUT_MS = 10_000;

interface SmsPilotResponse {
  error?: {
    code?: string;
    description_ru?: string;
  };
  send?: Array<{
    status?: string | number;
  }>;
}

@Injectable()
export class SmsPilotSmsSender implements SmsSender {
  private readonly logger = new Logger(SmsPilotSmsSender.name);
  private readonly apiKey: string;
  private readonly sender: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('SMSPILOT_API_KEY');
    this.sender = config.getOrThrow<string>('SMSPILOT_SENDER');
  }

  async sendCode(phone: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      send: `Такси Бгр: код ${code}.`,
      to: phone.replace(/^\+/, ''),
      apikey: this.apiKey,
      format: 'json',
      lang: 'ru',
    });
    if (this.sender) {
      body.set('from', this.sender);
    }

    let response: Response;
    try {
      response = await fetch(SMSPILOT_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(SMSPILOT_REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      this.logger.error(`SMSPILOT request failed: ${this.errorMessage(error)}`);
      this.throwDeliveryError();
    }

    if (!response.ok) {
      this.logger.error(`SMSPILOT returned HTTP ${response.status}`);
      this.throwDeliveryError();
    }

    const payload = await this.parseResponse(response);
    const result = payload.send?.[0];
    if (payload.error || !result || String(result.status) !== '0') {
      this.logger.error(
        `SMSPILOT rejected SMS: ${payload.error?.code ?? 'unknown_error'}`,
      );
      this.throwDeliveryError();
    }
  }

  private async parseResponse(response: Response): Promise<SmsPilotResponse> {
    try {
      return (await response.json()) as SmsPilotResponse;
    } catch (error: unknown) {
      this.logger.error(
        `SMSPILOT returned an invalid response: ${this.errorMessage(error)}`,
      );
      this.throwDeliveryError();
    }
  }

  private throwDeliveryError(): never {
    throw new ServiceUnavailableException({
      code: 'SMS_DELIVERY_FAILED',
      message: 'Unable to send verification code',
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown_error';
  }
}
