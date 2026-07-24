export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SmsSender {
  sendCode(phone: string, code: string): Promise<void>;
}
