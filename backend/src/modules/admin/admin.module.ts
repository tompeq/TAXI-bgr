import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TariffSettingEntity } from '../orders/tariff-setting.entity';
import { StorageModule } from '../storage/storage.module';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { UserEntity } from '../users/user.entity';
import { ServiceSettingsEntity } from '../service-settings/service-settings.entity';
import { RoadConditionStateEntity } from '../surveys/road-condition-state.entity';
import { ActivityEventEntity } from '../activity-events/activity-event.entity';
import { OrderEntity } from '../orders/order.entity';
import { FinanceModule } from '../finance/finance.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { DriverVerificationReviewEntity } from './driver-verification-review.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverProfileEntity,
      UserEntity,
      DriverVerificationReviewEntity,
      TariffSettingEntity,
      ServiceSettingsEntity,
      RoadConditionStateEntity,
      OrderEntity,
      ActivityEventEntity,
    ]),
    StorageModule,
    ActivityEventsModule,
    OutboxModule,
    FinanceModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
