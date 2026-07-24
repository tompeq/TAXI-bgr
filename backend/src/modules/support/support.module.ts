import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEventsModule } from '../activity-events/activity-events.module';
import { AdminGuard } from '../admin/admin.guard';
import { UserEntity } from '../users/user.entity';
import { AdminSupportController } from './admin-support.controller';
import { SupportConversationEntity } from './support-conversation.entity';
import { SupportController } from './support.controller';
import { SupportMessageEntity } from './support-message.entity';
import { SupportService } from './support.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportConversationEntity,
      SupportMessageEntity,
      UserEntity,
    ]),
    ActivityEventsModule,
  ],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminGuard],
  exports: [SupportService],
})
export class SupportModule {}
