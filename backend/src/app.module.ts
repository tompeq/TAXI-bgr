import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { environmentValidationSchema } from './config/environment.validation';
import { createTypeOrmOptions } from './infrastructure/database/typeorm.config';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { ActivityEventsModule } from './modules/activity-events/activity-events.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { DriverWorkModule } from './modules/driver-work/driver-work.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ServiceZonesModule } from './modules/service-zones/service-zones.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { ServiceSettingsModule } from './modules/service-settings/service-settings.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { FinanceModule } from './modules/finance/finance.module';
import { SupportModule } from './modules/support/support.module';
import { EngagementModule } from './modules/engagement/engagement.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmOptions,
    }),
    RedisModule,
    ServiceSettingsModule,
    HealthModule,
    DriverWorkModule,
    AdminModule,
    UsersModule,
    ServiceZonesModule,
    StorageModule,
    ActivityEventsModule,
    OutboxModule,
    NotificationsModule,
    SurveysModule,
    FinanceModule,
    SupportModule,
    EngagementModule,
    OrdersModule,
    TrackingModule,
    AuthModule,
  ],
})
export class AppModule {}
