import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { OrderEntity } from '../orders/order.entity';
import { OutboxModule } from '../outbox/outbox.module';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { FinanceModule } from '../finance/finance.module';
import { DriverShiftEntity } from './driver-shift.entity';
import { DriverWorkController } from './driver-work.controller';
import { DriverWorkService } from './driver-work.service';
import { DriverWorkSettingsEntity } from './driver-work-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverShiftEntity,
      DriverWorkSettingsEntity,
      DriverProfileEntity,
      OrderEntity,
    ]),
    ActivityEventsModule,
    OutboxModule,
    FinanceModule,
  ],
  controllers: [DriverWorkController],
  providers: [DriverWorkService],
  exports: [DriverWorkService],
})
export class DriverWorkModule {}
