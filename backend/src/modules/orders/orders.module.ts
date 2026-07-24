import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { DriverWorkModule } from '../driver-work/driver-work.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OrderEntity } from './order.entity';
import { OrderStatusHistoryEntity } from './order-status-history.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TariffSettingEntity } from './tariff-setting.entity';
import { TariffService } from './tariff.service';
import { OrdersAutomationService } from './orders-automation.service';
import { SurveysModule } from '../surveys/surveys.module';
import { FinanceModule } from '../finance/finance.module';
import { ServiceZonesModule } from '../service-zones/service-zones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderStatusHistoryEntity,
      TariffSettingEntity,
    ]),
    ActivityEventsModule,
    DriverWorkModule,
    OutboxModule,
    SurveysModule,
    FinanceModule,
    ServiceZonesModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersAutomationService, TariffService],
  exports: [TypeOrmModule, OrdersService, TariffService],
})
export class OrdersModule {}
