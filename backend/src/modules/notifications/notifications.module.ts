import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from '../outbox/outbox-event.entity';
import { DeviceRegistrationEntity } from './device-registration.entity';
import { FcmNotificationSender } from './fcm-notification.sender';
import { NotificationOutboxProcessor } from './notification-outbox.processor';
import { NotificationSender } from './notification-sender';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceRegistrationEntity, OutboxEventEntity]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationOutboxProcessor,
    FcmNotificationSender,
    { provide: NotificationSender, useExisting: FcmNotificationSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
