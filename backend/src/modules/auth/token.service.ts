import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { UserRole } from '../users/user-role.enum';
import {
  AccessTokenPayload,
  MobileUserRole,
  RegistrationTokenPayload,
} from './auth.types';

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly registrationSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly registrationTtlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.registrationSecret = config.getOrThrow<string>(
      'JWT_REGISTRATION_SECRET',
    );
    this.accessTtlSeconds = config.getOrThrow<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
    );
    this.registrationTtlSeconds = config.getOrThrow<number>(
      'REGISTRATION_TOKEN_TTL_SECONDS',
    );
  }

  async issueAccessToken(
    userId: string,
    sessionId: string,
    role: UserRole,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      role,
      type: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSeconds,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.accessSecret,
      });
      if (payload.type !== 'access' || !payload.sub || !payload.sid) {
        throw new Error('Unexpected token type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_INVALID',
        message: 'Access token is invalid or expired',
      });
    }
  }

  async issueRegistrationToken(
    phone: string,
    role: MobileUserRole,
  ): Promise<{
    token: string;
    expiresInSeconds: number;
  }> {
    const jti = randomUUID();
    const payload: RegistrationTokenPayload = {
      sub: phone,
      jti,
      role,
      type: 'registration',
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.registrationSecret,
      expiresIn: this.registrationTtlSeconds,
    });
    await this.redis.connection.set(
      this.registrationKey(jti),
      this.registrationValue(phone, role),
      'EX',
      this.registrationTtlSeconds,
    );
    return { token, expiresInSeconds: this.registrationTtlSeconds };
  }

  async assertRegistrationToken(
    token: string,
  ): Promise<RegistrationTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RegistrationTokenPayload>(
        token,
        { secret: this.registrationSecret },
      );
      if (
        payload.type !== 'registration' ||
        !payload.sub ||
        !payload.jti ||
        !this.isMobileUserRole(payload.role)
      ) {
        throw new Error('Unexpected token type');
      }
      const storedRegistration = await this.redis.connection.get(
        this.registrationKey(payload.jti),
      );
      if (
        storedRegistration !== this.registrationValue(payload.sub, payload.role)
      ) {
        throw new Error('Registration token was consumed');
      }
      return payload;
    } catch {
      throw new UnauthorizedException({
        code: 'REGISTRATION_TOKEN_INVALID',
        message: 'Registration token is invalid or expired',
      });
    }
  }

  async consumeRegistrationToken(jti: string): Promise<void> {
    await this.redis.connection.del(this.registrationKey(jti));
  }

  createRefreshToken(sessionId: string): string {
    return `${sessionId}.${randomBytes(32).toString('base64url')}`;
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  get accessTokenTtlSeconds(): number {
    return this.accessTtlSeconds;
  }

  private registrationKey(jti: string): string {
    return `auth:registration:${jti}`;
  }

  private registrationValue(phone: string, role: MobileUserRole): string {
    return `${phone}:${role}`;
  }

  private isMobileUserRole(role: unknown): role is MobileUserRole {
    return role === UserRole.Passenger || role === UserRole.Driver;
  }
}
