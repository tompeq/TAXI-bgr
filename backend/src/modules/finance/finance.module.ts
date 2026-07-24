import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { OrderEntity } from '../orders/order.entity';
import { ServiceSettingsEntity } from '../service-settings/service-settings.entity';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { FinanceController } from './finance.controller';
import { DriverCommissionLedgerEntryEntity } from './driver-commission-ledger-entry.entity';
import { FinanceService } from './finance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverCommissionLedgerEntryEntity,
      DriverProfileEntity,
      OrderEntity,
      ServiceSettingsEntity,
    ]),
    ActivityEventsModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService, TypeOrmModule],
})
export class FinanceModule {}
