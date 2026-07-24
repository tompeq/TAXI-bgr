import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventEntity } from './activity-event.entity';
import { ActivityEventsService } from './activity-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityEventEntity])],
  providers: [ActivityEventsService],
  exports: [ActivityEventsService],
})
export class ActivityEventsModule {}
