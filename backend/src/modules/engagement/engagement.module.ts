import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../admin/admin.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderEntity } from '../orders/order.entity';
import { UserEntity } from '../users/user.entity';
import { AdminEngagementController } from './admin-engagement.controller';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { OrderMessageEntity } from './order-message.entity';
import { OrderRatingEntity } from './order-rating.entity';
import { SurveyResponseEntity } from './survey-response.entity';
import { SurveyTemplateEntity } from './survey-template.entity';
import { UserAnnouncementReceiptEntity } from './user-announcement-receipt.entity';
import { UserAnnouncementEntity } from './user-announcement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      UserEntity,
      OrderMessageEntity,
      OrderRatingEntity,
      SurveyTemplateEntity,
      SurveyResponseEntity,
      UserAnnouncementEntity,
      UserAnnouncementReceiptEntity,
    ]),
    NotificationsModule,
  ],
  controllers: [EngagementController, AdminEngagementController],
  providers: [EngagementService, AdminGuard],
  exports: [EngagementService],
})
export class EngagementModule {}
