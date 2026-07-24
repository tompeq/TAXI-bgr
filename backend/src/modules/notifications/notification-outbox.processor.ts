import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThan, Repository } from 'typeorm';
import { DriverShiftEntity } from '../driver-work/driver-shift.entity';
import { DriverWorkSettingsEntity } from '../driver-work/driver-work-settings.entity';
import { DriverWorkStatus } from '../driver-work/driver-work-status.enum';
import { OrderEntity } from '../orders/order.entity';
import { OrderKind } from '../orders/order-kind.enum';
import { OrderStatus } from '../orders/order-status.enum';
import { OutboxEventEntity } from '../outbox/outbox-event.entity';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { UserEntity } from '../users/user.entity';
import { UserStatus } from '../users/user-status.enum';
import { NotificationsService } from './notifications.service';

const MAX_NOTIFICATION_ATTEMPTS = 10;
const STALE_NOTIFICATION_EVENT_MS = 15 * 60 * 1000;
const NOTIFIABLE_EVENT_TYPES = [
  'order.created',
  'order.status_changed',
  'order.approaching',
];

@Injectable()
export class NotificationOutboxProcessor {
  private readonly logger = new Logger(NotificationOutboxProcessor.name);
  private readonly businessTimeZone: string;

  constructor(
    config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    @InjectRepository(OutboxEventEntity)
    private readonly events: Repository<OutboxEventEntity>,
  ) {
    this.businessTimeZone = config.getOrThrow<string>('BUSINESS_TIME_ZONE');
  }

  @Cron('*/5 * * * * *', { waitForCompletion: true })
  async process(): Promise<void> {
    if (!this.notifications.enabled) {
      return;
    }
    const events = await this.events.find({
      select: { id: true },
      where: {
        publishedAt: IsNull(),
        attempts: LessThan(MAX_NOTIFICATION_ATTEMPTS),
        eventType: In(NOTIFIABLE_EVENT_TYPES),
      },
      order: { occurredAt: 'ASC' },
      take: 50,
    });
    for (const event of events) {
      await this.processEvent(event.id);
    }
  }

  private async processEvent(eventId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const event = await manager
        .getRepository(OutboxEventEntity)
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.id = :eventId', { eventId })
        .andWhere('event.publishedAt IS NULL')
        .andWhere('event.attempts < :maxAttempts', {
          maxAttempts: MAX_NOTIFICATION_ATTEMPTS,
        })
        .andWhere('event.eventType IN (:...eventTypes)', {
          eventTypes: NOTIFIABLE_EVENT_TYPES,
        })
        .getOne();
      if (!event) {
        return;
      }

      if (
        event.occurredAt < new Date(Date.now() - STALE_NOTIFICATION_EVENT_MS)
      ) {
        event.publishedAt = new Date();
        event.lastError = 'Skipped because the notification event is stale';
        await manager.getRepository(OutboxEventEntity).save(event);
        return;
      }

      try {
        await this.dispatch(event);
        event.publishedAt = new Date();
        event.lastError = null;
      } catch (error) {
        event.attempts += 1;
        event.lastError =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Notification event ${event.id} failed`, error);
      }
      await manager.getRepository(OutboxEventEntity).save(event);
    });
  }

  private async dispatch(event: OutboxEventEntity): Promise<void> {
    if (event.eventType === 'order.created') {
      await this.notifyDriversAboutOrder(event.aggregateId);
      return;
    }
    if (
      event.eventType === 'order.status_changed' ||
      event.eventType === 'order.approaching'
    ) {
      await this.notifyOrderOwner(event);
    }
  }

  private async notifyDriversAboutOrder(orderId: string): Promise<void> {
    const order = await this.dataSource
      .getRepository(OrderEntity)
      .findOneBy({ id: orderId });
    if (!order) {
      return;
    }
    const isNight = this.isNightTime(new Date());
    const rows = await this.dataSource
      .getRepository(DriverWorkSettingsEntity)
      .createQueryBuilder('settings')
      .select('settings.driverUserId', 'driverUserId')
      .distinct(true)
      .innerJoin(
        DriverProfileEntity,
        'profile',
        'profile.userId = settings.driverUserId',
      )
      .innerJoin(UserEntity, 'user', 'user.id = settings.driverUserId')
      .leftJoin(
        DriverShiftEntity,
        'shift',
        'shift.driverUserId = settings.driverUserId AND shift.endedAt IS NULL',
      )
      .where('profile.verificationStatus = :verificationStatus', {
        verificationStatus: DriverVerificationStatus.Approved,
      })
      .andWhere('user.status = :userStatus', { userStatus: UserStatus.Active })
      .andWhere(
        order.kind === OrderKind.Delivery
          ? 'settings.acceptsDelivery = true'
          : 'settings.acceptsTaxi = true',
      )
      .andWhere(
        `(
          (shift.status = :onlineStatus AND settings.backgroundNotifications = true)
          OR (:isNight = true AND settings.nightNotifications = true)
        )`,
        { onlineStatus: DriverWorkStatus.Online, isNight },
      )
      .getRawMany<{ driverUserId: string }>();
    await this.notifications.sendToUsers(
      rows.map((row) => row.driverUserId),
      {
        title:
          order.kind === OrderKind.Delivery ? 'Новая доставка' : 'Новый заказ',
        body: `${order.pickupAddress} → ${order.destinationAddress}, ${order.fareAmount} ₽`,
        data: { type: 'new_order' },
      },
    );
  }

  private isNightTime(time: Date): boolean {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: this.businessTimeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(time)
      .find((part) => part.type === 'hour');
    const hour = Number(hourPart?.value);
    return Number.isInteger(hour) && (hour >= 21 || hour < 6);
  }

  private async notifyOrderOwner(event: OutboxEventEntity): Promise<void> {
    const order = await this.dataSource
      .getRepository(OrderEntity)
      .findOneBy({ id: event.aggregateId });
    if (!order) {
      return;
    }
    const nextStatus = event.payload.nextStatus as OrderStatus | undefined;
    const message = this.passengerMessage(event.eventType, nextStatus);
    if (!message) {
      return;
    }
    await this.notifications.sendToUsers([order.passengerUserId], {
      ...message,
      data: {
        type:
          event.eventType === 'order.approaching'
            ? 'arrival_soon'
            : 'order_status',
        orderId: order.id,
        status: nextStatus ?? order.status,
      },
    });
  }

  private passengerMessage(
    eventType: string,
    status?: OrderStatus,
  ): { title: string; body: string } | null {
    if (eventType === 'order.approaching') {
      return {
        title: 'Водитель скоро будет',
        body: 'До прибытия около 3 минут',
      };
    }
    return (
      (
        {
          [OrderStatus.Accepted]: {
            title: 'Водитель принял заказ',
            body: 'Автомобиль скоро отправится к вам',
          },
          [OrderStatus.DriverEnRoute]: {
            title: 'Водитель едет',
            body: 'Следите за автомобилем на карте',
          },
          [OrderStatus.Arrived]: {
            title: 'Водитель приехал',
            body: 'Автомобиль ожидает в точке подачи',
          },
          [OrderStatus.Waiting]: {
            title: 'Началось ожидание',
            body: 'После бесплатного периода включится поминутная оплата',
          },
          [OrderStatus.Started]: {
            title: 'Поездка началась',
            body: 'Маршрут отображается в приложении',
          },
          [OrderStatus.Open]: {
            title: 'Снова ищем водителя',
            body: 'Предыдущий водитель не начал движение вовремя',
          },
          [OrderStatus.Canceled]: {
            title: 'Заказ отменён',
            body: 'Подробности доступны в приложении',
          },
        } as Partial<Record<OrderStatus, { title: string; body: string }>>
      )[status ?? OrderStatus.Completed] ?? null
    );
  }
}
