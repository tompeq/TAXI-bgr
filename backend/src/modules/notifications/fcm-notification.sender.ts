import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import {
  NotificationSender,
  PushMessage,
  PushSendResult,
} from './notification-sender';

@Injectable()
export class FcmNotificationSender implements NotificationSender {
  private readonly logger = new Logger(FcmNotificationSender.name);
  private auth?: GoogleAuth;
  private projectId?: string;
  enabled: boolean;

  constructor(config: ConfigService) {
    const encoded = config.get<string>('FCM_SERVICE_ACCOUNT_BASE64')?.trim();
    this.enabled = Boolean(encoded);
    if (!encoded) {
      this.logger.warn('FCM is disabled: service account is not configured');
      return;
    }
    try {
      const serviceAccount = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8'),
      ) as {
        client_email?: string;
        private_key?: string;
        project_id?: string;
      };
      if (
        !serviceAccount.client_email ||
        !serviceAccount.private_key ||
        !serviceAccount.project_id
      ) {
        throw new Error('Required service account fields are missing');
      }
      this.projectId = serviceAccount.project_id;
      this.auth = new GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
    } catch (error) {
      this.enabled = false;
      this.logger.error('FCM service account is invalid', error);
    }
  }

  async send(tokens: string[], message: PushMessage): Promise<PushSendResult> {
    if (!this.enabled || tokens.length === 0) {
      return { invalidTokens: [] };
    }
    const client = await this.auth!.getClient();
    const invalidTokens: string[] = [];
    await Promise.all(
      tokens.map(async (token) => {
        try {
          await client.request({
            url: `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
            method: 'POST',
            data: {
              message: {
                token,
                notification: {
                  title: message.title,
                  body: message.body,
                },
                data: message.data,
                android: {
                  priority: 'high',
                  notification: { channel_id: 'taxi_orders', sound: 'default' },
                },
                apns: { payload: { aps: { sound: 'default' } } },
              },
            },
          });
        } catch (error) {
          if (this.isInvalidTokenError(error)) {
            invalidTokens.push(token);
            return;
          }
          throw error;
        }
      }),
    );
    return { invalidTokens };
  }

  private isInvalidTokenError(error: unknown): boolean {
    const response = (error as { response?: { data?: unknown } }).response;
    const serialized = JSON.stringify(response?.data ?? error);
    return (
      serialized.includes('UNREGISTERED') ||
      serialized.includes('registration-token-not-registered')
    );
  }
}
