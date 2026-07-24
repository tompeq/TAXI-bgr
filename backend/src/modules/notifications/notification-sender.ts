export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  invalidTokens: string[];
}

export abstract class NotificationSender {
  abstract readonly enabled: boolean;
  abstract send(
    tokens: string[],
    message: PushMessage,
  ): Promise<PushSendResult>;
}
