import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { TrackingGateway } from './tracking.gateway';
import { TrackingService } from './tracking.service';

@Module({
  imports: [AuthModule, OrdersModule],
  providers: [TrackingGateway, TrackingService],
})
export class TrackingModule {}
