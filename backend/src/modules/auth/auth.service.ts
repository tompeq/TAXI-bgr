import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DataSource,
  IsNull,
  MoreThan,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { DriverWorkSettingsEntity } from '../driver-work/driver-work-settings.entity';
import { OutboxService } from '../outbox/outbox.service';
import { RegistrationUploadKind } from '../storage/registration-upload-kind.enum';
import { StorageService } from '../storage/storage.service';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { UserRole } from '../users/user-role.enum';
import { UserStatus } from '../users/user-status.enum';
import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthSessionEntity } from './auth-session.entity';
import {
  AuthenticatedUser,
  MobileUserRole,
  RegistrationTokenPayload,
  SessionResponse,
  UserResponse,
} from './auth.types';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpChallengeResponse, OtpService } from './otp.service';
import { TokenService } from './token.service';
import type { MultipartFile } from '@fastify/multipart';

interface RequestContext {
  ipAddress: string;
  deviceName?: string;
}

@Injectable()
export class AuthService {
  private readonly refreshTokenTtlDays: number;

  constructor(
    config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly usersService: UsersService,
    private readonly activityEvents: ActivityEventsService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
  ) {
    this.refreshTokenTtlDays = config.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_DAYS',
    );
  }

  requestOtp(phone: string, ipAddress: string): Promise<OtpChallengeResponse> {
    return this.otp.requestCode(phone, ipAddress);
  }

  async verifyOtp(
    input: VerifyOtpDto,
    context: RequestContext,
  ): Promise<
    | ({ status: 'authenticated' } & SessionResponse)
    | {
        status: 'registration_required';
        registrationToken: string;
        registrationTokenExpiresInSeconds: number;
      }
  > {
    const phone = await this.otp.verifyCode(input.challengeId, input.code);
    const user = await this.usersService.findByPhoneAndRole(phone, input.role);

    if (!user) {
      const registrationRole = this.toMobileUserRole(input.role);
      if (registrationRole === null) {
        throw new UnauthorizedException({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        });
      }
      const registration = await this.tokens.issueRegistrationToken(
        phone,
        registrationRole,
      );
      return {
        status: 'registration_required',
        registrationToken: registration.token,
        registrationTokenExpiresInSeconds: registration.expiresInSeconds,
      };
    }
    this.assertUserCanAuthenticate(user);

    return {
      status: 'authenticated',
      ...(await this.createSession(user, {
        ...context,
        deviceName: input.deviceName ?? context.deviceName,
      })),
    };
  }

  async registerPassenger(
    input: RegisterPassengerDto,
    context: RequestContext,
  ): Promise<SessionResponse> {
    const registration = await this.tokens.assertRegistrationToken(
      input.registrationToken,
    );
    this.assertRegistrationRole(registration, UserRole.Passenger);
    if (input.avatarObjectKey) {
      await this.storage.assertRegistrationImages(
        registration.jti,
        [input.avatarObjectKey],
        [RegistrationUploadKind.Avatar],
      );
    }

    const user = await this.createRegisteredUser(async () => {
      return this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(UserEntity);
        const user = await users.save(
          users.create({
            phone: registration.sub,
            name: input.name.trim(),
            role: UserRole.Passenger,
            status: UserStatus.Active,
            avatarObjectKey: input.avatarObjectKey ?? null,
          }),
        );
        await this.recordRegistration(user, manager);
        return user;
      });
    });

    await this.tokens.consumeRegistrationToken(registration.jti);
    return this.createSession(user, {
      ...context,
      deviceName: input.deviceName ?? context.deviceName,
    });
  }

  async registerDriver(
    input: RegisterDriverDto,
    context: RequestContext,
  ): Promise<SessionResponse> {
    if (new Set(input.carPhotoKeys).size !== 4) {
      throw new BadRequestException({
        code: 'CAR_PHOTOS_MUST_BE_UNIQUE',
        message: 'Four different car photos are required',
      });
    }

    const registration = await this.tokens.assertRegistrationToken(
      input.registrationToken,
    );
    this.assertRegistrationRole(registration, UserRole.Driver);
    const fullName = input.fullName.trim();
    await this.storage.assertRegistrationImages(
      registration.jti,
      [input.licensePhotoKey, input.licensePhotoBackKey],
      [RegistrationUploadKind.License, RegistrationUploadKind.LicenseBack],
    );
    await this.storage.assertDriverCarKinds(
      registration.jti,
      input.carPhotoKeys,
    );

    const user = await this.createRegisteredUser(async () => {
      return this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(UserEntity);
        const driverProfiles = manager.getRepository(DriverProfileEntity);
        const driverWorkSettings = manager.getRepository(
          DriverWorkSettingsEntity,
        );
        const user = await users.save(
          users.create({
            phone: registration.sub,
            name: fullName,
            role: UserRole.Driver,
            status: UserStatus.PendingVerification,
            avatarObjectKey: null,
          }),
        );
        await driverProfiles.save(
          driverProfiles.create({
            userId: user.id,
            fullName,
            licensePhotoKey: input.licensePhotoKey,
            licensePhotoBackKey: input.licensePhotoBackKey,
            vehicleMakeModel: input.vehicleMakeModel.trim(),
            vehicleColor: input.vehicleColor.trim(),
            vehiclePlate: input.vehiclePlate.trim().toUpperCase(),
            carPhotoKeys: input.carPhotoKeys,
            verificationStatus: DriverVerificationStatus.Pending,
            reviewedByUserId: null,
            reviewedAt: null,
            reviewComment: null,
            blockedReason: null,
          }),
        );
        await driverWorkSettings.save(
          driverWorkSettings.create({
            driverUserId: user.id,
            acceptsTaxi: true,
            acceptsDelivery: true,
            backgroundNotifications: true,
            nightNotifications: false,
          }),
        );
        await this.recordRegistration(user, manager);
        return user;
      });
    });

    await this.tokens.consumeRegistrationToken(registration.jti);
    return this.createSession(user, {
      ...context,
      deviceName: input.deviceName ?? context.deviceName,
    });
  }

  async refresh(
    input: RefreshSessionDto,
    ipAddress: string,
  ): Promise<SessionResponse> {
    const sessionId = this.extractSessionId(input.refreshToken);
    const suppliedHash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findOne({
      where: {
        id: sessionId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });
    if (!session || !this.hashesMatch(session.refreshTokenHash, suppliedHash)) {
      throw this.invalidRefreshToken();
    }
    this.assertUserCanAuthenticate(session.user);

    const refreshToken = this.tokens.createRefreshToken(session.id);
    const refreshTokenHash = this.tokens.hashRefreshToken(refreshToken);
    const updated = await this.sessions.update(
      {
        id: session.id,
        refreshTokenHash: suppliedHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      {
        refreshTokenHash,
        lastUsedAt: new Date(),
        lastIp: ipAddress,
      },
    );
    if (updated.affected !== 1) {
      throw this.invalidRefreshToken();
    }

    return {
      accessToken: await this.tokens.issueAccessToken(
        session.user.id,
        session.id,
        session.user.role,
      ),
      refreshToken,
      accessTokenExpiresInSeconds: this.tokens.accessTokenTtlSeconds,
      user: await this.toUserResponse(session.user),
    };
  }

  async uploadRegistrationImage(
    registrationToken: string,
    kind: RegistrationUploadKind,
    file: MultipartFile,
  ): Promise<{ objectKey: string }> {
    const registration =
      await this.tokens.assertRegistrationToken(registrationToken);
    return this.storage.putRegistrationImage(registration.jti, kind, file);
  }

  async logout(currentUser: AuthenticatedUser): Promise<void> {
    const result = await this.sessions.update(
      {
        id: currentUser.sessionId,
        userId: currentUser.userId,
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
    if (result.affected === 1) {
      await this.activityEvents.record({
        eventType: 'logout',
        actorUserId: currentUser.userId,
        entityType: 'auth_session',
        entityId: currentUser.sessionId,
      });
    }
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.tokens.verifyAccessToken(token);
    const session = await this.sessions.findOne({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });
    if (!session || session.user.status === UserStatus.Blocked) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }
    return {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };
  }

  async getCurrentUser(currentUser: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.usersService.findById(currentUser.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toUserResponse(user);
  }

  private async createSession(
    user: UserEntity,
    context: RequestContext,
  ): Promise<SessionResponse> {
    const id = randomUUID();
    const refreshToken = this.tokens.createRefreshToken(id);
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.refreshTokenTtlDays);

    await this.sessions.save(
      this.sessions.create({
        id,
        userId: user.id,
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        deviceName: context.deviceName?.trim() || null,
        lastIp: context.ipAddress,
        expiresAt,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    await this.activityEvents.record({
      eventType: 'login_succeeded',
      actorUserId: user.id,
      entityType: 'auth_session',
      entityId: id,
      metadata: { role: user.role },
    });

    return {
      accessToken: await this.tokens.issueAccessToken(user.id, id, user.role),
      refreshToken,
      accessTokenExpiresInSeconds: this.tokens.accessTokenTtlSeconds,
      user: await this.toUserResponse(user),
    };
  }

  private async recordRegistration(
    user: UserEntity,
    manager: Parameters<ActivityEventsService['record']>[1],
  ): Promise<void> {
    await this.activityEvents.record(
      {
        eventType: 'user_registered',
        actorUserId: user.id,
        entityType: 'user',
        entityId: user.id,
        metadata: { role: user.role },
      },
      manager,
    );
    await this.outbox.enqueue(
      {
        aggregateType: 'user',
        aggregateId: user.id,
        eventType: 'user.registered',
        payload: { userId: user.id, role: user.role },
      },
      manager,
    );
  }

  private async createRegisteredUser(
    create: () => Promise<UserEntity>,
  ): Promise<UserEntity> {
    try {
      return await create();
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'Phone is already registered',
        });
      }
      throw error;
    }
  }

  private assertRegistrationRole(
    registration: RegistrationTokenPayload,
    expectedRole: MobileUserRole,
  ): void {
    if (registration.role !== expectedRole) {
      throw new ForbiddenException({
        code: 'REGISTRATION_ROLE_MISMATCH',
        message: 'Registration token does not match the selected role',
      });
    }
  }

  private toMobileUserRole(role: UserRole): MobileUserRole | null {
    return role === UserRole.Passenger || role === UserRole.Driver
      ? role
      : null;
  }

  private async toUserResponse(user: UserEntity): Promise<UserResponse> {
    const response: UserResponse = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      status: user.status,
    };
    if (user.role === UserRole.Driver) {
      const profile = await this.usersService.findDriverProfile(user.id);
      if (profile) {
        response.driverVerificationStatus = profile.verificationStatus;
        response.driverVerificationComment = profile.reviewComment;
      }
    }
    return response;
  }

  private assertUserCanAuthenticate(user: UserEntity): void {
    if (user.status === UserStatus.Blocked) {
      throw new ForbiddenException({
        code: 'USER_BLOCKED',
        message: 'User is blocked',
      });
    }
  }

  private extractSessionId(refreshToken: string): string {
    const separator = refreshToken.indexOf('.');
    if (separator <= 0) {
      throw this.invalidRefreshToken();
    }
    return refreshToken.slice(0, separator);
  }

  private hashesMatch(stored: string, supplied: string): boolean {
    const storedBuffer = Buffer.from(stored, 'hex');
    const suppliedBuffer = Buffer.from(supplied, 'hex');
    return (
      storedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(storedBuffer, suppliedBuffer)
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: unknown };
    return driverError.code === '23505';
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_INVALID',
      message: 'Refresh token is invalid or expired',
    });
  }
}
