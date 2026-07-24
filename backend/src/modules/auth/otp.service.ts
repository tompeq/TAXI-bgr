import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { SMS_SENDER } from './sms/sms-sender';
import type { SmsSender } from './sms/sms-sender';

const INCREMENT_WITH_EXPIRY_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

const VERIFY_OTP_SCRIPT = `
  if redis.call('EXISTS', KEYS[1]) == 0 then
    return {'missing'}
  end

  local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
  local storedHash = redis.call('HGET', KEYS[1], 'code_hash')

  if storedHash == ARGV[1] then
    local phone = redis.call('HGET', KEYS[1], 'phone')
    redis.call('DEL', KEYS[1])
    return {'ok', phone}
  end

  local maxAttempts = tonumber(ARGV[2])
  if attempts >= maxAttempts then
    redis.call('DEL', KEYS[1])
    return {'locked'}
  end

  return {'invalid', tostring(maxAttempts - attempts)}
`;

export interface OtpChallengeResponse {
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  debugCode?: string;
}

@Injectable()
export class OtpService {
  private readonly ttlSeconds: number;
  private readonly resendSeconds: number;
  private readonly maxAttempts: number;
  private readonly maxRequestsPerHour: number;
  private readonly hashSecret: string;
  private readonly smsMode: string;
  private readonly nodeEnv: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @Inject(SMS_SENDER) private readonly smsSender: SmsSender,
  ) {
    this.ttlSeconds = config.getOrThrow<number>('OTP_TTL_SECONDS');
    this.resendSeconds = config.getOrThrow<number>('OTP_RESEND_SECONDS');
    this.maxAttempts = config.getOrThrow<number>('OTP_MAX_ATTEMPTS');
    this.maxRequestsPerHour = config.getOrThrow<number>(
      'OTP_MAX_REQUESTS_PER_HOUR',
    );
    this.hashSecret = config.getOrThrow<string>('OTP_HASH_SECRET');
    this.smsMode = config.getOrThrow<string>('SMS_MODE');
    this.nodeEnv = config.getOrThrow<string>('NODE_ENV');
  }

  async requestCode(
    phone: string,
    ipAddress: string,
  ): Promise<OtpChallengeResponse> {
    if (!this.isMockSmsMode) {
      await this.enforceRequestLimits(phone, ipAddress);
    }

    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challengeKey = this.challengeKey(challengeId);
    const codeHash = this.hashCode(challengeId, code);

    await this.redis.connection
      .multi()
      .hset(
        challengeKey,
        'phone',
        phone,
        'code_hash',
        codeHash,
        'attempts',
        '0',
      )
      .expire(challengeKey, this.ttlSeconds)
      .exec();

    try {
      await this.smsSender.sendCode(phone, code);
    } catch (error: unknown) {
      await this.redis.connection.del(challengeKey);
      if (!this.isMockSmsMode) {
        await this.redis.connection.del(`auth:otp:cooldown:${phone}`);
      }
      throw error;
    }

    return {
      challengeId,
      expiresInSeconds: this.ttlSeconds,
      resendAfterSeconds: this.resendSeconds,
      ...(this.isMockSmsMode ? { debugCode: code } : {}),
    };
  }

  async verifyCode(challengeId: string, code: string): Promise<string> {
    const result = (await this.redis.connection.eval(
      VERIFY_OTP_SCRIPT,
      1,
      this.challengeKey(challengeId),
      this.hashCode(challengeId, code),
      this.maxAttempts.toString(),
    )) as string[];

    switch (result[0]) {
      case 'ok':
        return result[1];
      case 'locked':
        throw new UnauthorizedException({
          code: 'OTP_ATTEMPTS_EXCEEDED',
          message: 'OTP attempts exceeded',
        });
      case 'invalid':
        throw new UnauthorizedException({
          code: 'OTP_INVALID',
          message: 'Invalid OTP',
          attemptsRemaining: Number(result[1]),
        });
      default:
        throw new UnauthorizedException({
          code: 'OTP_EXPIRED',
          message: 'OTP challenge expired',
        });
    }
  }

  private async incrementHourlyLimit(key: string): Promise<number> {
    return Number(
      await this.redis.connection.eval(
        INCREMENT_WITH_EXPIRY_SCRIPT,
        1,
        key,
        '3600',
      ),
    );
  }

  private async enforceRequestLimits(
    phone: string,
    ipAddress: string,
  ): Promise<void> {
    const cooldownKey = `auth:otp:cooldown:${phone}`;
    const cooldownCreated = await this.redis.connection.set(
      cooldownKey,
      '1',
      'EX',
      this.resendSeconds,
      'NX',
    );
    if (cooldownCreated === null) {
      const retryAfter = await this.redis.connection.ttl(cooldownKey);
      this.throwRateLimit(Math.max(retryAfter, 1));
    }

    const [phoneRequests, ipRequests] = await Promise.all([
      this.incrementHourlyLimit(`auth:otp:hour:phone:${phone}`),
      this.incrementHourlyLimit(`auth:otp:hour:ip:${ipAddress}`),
    ]);
    if (
      phoneRequests > this.maxRequestsPerHour ||
      ipRequests > this.maxRequestsPerHour * 5
    ) {
      this.throwRateLimit(3600);
    }
  }

  private get isMockSmsMode(): boolean {
    return this.smsMode === 'mock' && this.nodeEnv !== 'production';
  }

  private hashCode(challengeId: string, code: string): string {
    return createHmac('sha256', this.hashSecret)
      .update(`${challengeId}:${code}`)
      .digest('hex');
  }

  private challengeKey(challengeId: string): string {
    return `auth:otp:challenge:${challengeId}`;
  }

  private throwRateLimit(retryAfterSeconds: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'OTP_RATE_LIMITED',
        message: 'Too many OTP requests',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
