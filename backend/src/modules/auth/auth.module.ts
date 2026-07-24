import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { OutboxModule } from '../outbox/outbox.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionEntity } from './auth-session.entity';
import { OtpService } from './otp.service';
import { DisabledSmsSender } from './sms/disabled-sms.sender';
import { MockSmsSender } from './sms/mock-sms.sender';
import { SmsPilotSmsSender } from './sms/smspilot-sms.sender';
import { SMS_SENDER, SmsSender } from './sms/sms-sender';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.register({}),
    TypeOrmModule.forFeature([AuthSessionEntity]),
    UsersModule,
    ActivityEventsModule,
    OutboxModule,
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    MockSmsSender,
    DisabledSmsSender,
    SmsPilotSmsSender,
    {
      provide: SMS_SENDER,
      inject: [
        ConfigService,
        MockSmsSender,
        DisabledSmsSender,
        SmsPilotSmsSender,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockSmsSender,
        disabled: DisabledSmsSender,
        smsPilot: SmsPilotSmsSender,
      ): SmsSender => {
        switch (config.getOrThrow<string>('SMS_MODE')) {
          case 'mock':
            return mock;
          case 'smspilot':
            return smsPilot;
          default:
            return disabled;
        }
      },
    },
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
