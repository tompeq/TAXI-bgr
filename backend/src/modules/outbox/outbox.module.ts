import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxService } from './outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
