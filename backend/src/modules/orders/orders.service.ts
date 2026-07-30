import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Point } from 'geojson';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DriverWorkService } from '../driver-work/driver-work.service';
import { FinanceService } from '../finance/finance.service';
import { OutboxService } from '../outbox/outbox.service';
import { UserRole } from '../users/user-role.enum';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrderBoardDto } from './dto/list-order-board.dto';
import { OrderEntity } from './order.entity';
import { OrderKind } from './order-kind.enum';
import { OrderPricingMode } from './order-pricing-mode.enum';
import { ACTIVE_DRIVER_ORDER_STATUSES, OrderStatus } from './order-status.enum';
import { OrderStatusHistoryEntity } from './order-status-history.entity';
import { TariffService } from './tariff.service';
import { ServiceSettingsService } from '../service-settings/service-settings.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

const PASSENGER_ACTIVE_STATUSES = [
  OrderStatus.Open,
  ...ACTIVE_DRIVER_ORDER_STATUSES,
] as const;

const PASSENGER_CANCELLATION_FREE_MINUTES = 3;
const PASSENGER_CANCELLATION_SMALL_FEE_UNTIL_MINUTES = 6;
const PASSENGER_CANCELLATION_FULL_FARE_AFTER_MINUTES = 10;
const PASSENGER_CANCELLATION_SMALL_FEE = 50;
const PASSENGER_CANCELLATION_MEDIUM_FEE = 100;

const DRIVER_TRANSITIONS: Readonly<Record<string, readonly OrderStatus[]>> = {
  [OrderStatus.Accepted]: [OrderStatus.DriverEnRoute],
  [OrderStatus.DriverEnRoute]: [OrderStatus.Arrived],
  [OrderStatus.Arrived]: [OrderStatus.Waiting, OrderStatus.Started],
  [OrderStatus.Waiting]: [OrderStatus.Started],
  [OrderStatus.Started]: [OrderStatus.Completed],
};

const DRIVING_ORDER_STATUSES = [
  OrderStatus.DriverEnRoute,
  OrderStatus.Arrived,
  OrderStatus.Waiting,
  OrderStatus.Started,
] as const;
const SCHEDULED_ACCEPT_BLOCK_MINUTES = 5;
const SCHEDULED_RESERVATION_CONFLICT_MINUTES = 30;

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tariffs: TariffService,
    private readonly driverWork: DriverWorkService,
    private readonly activityEvents: ActivityEventsService,
    private readonly outbox: OutboxService,
    private readonly serviceSettings: ServiceSettingsService,
    private readonly finance: FinanceService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
  ) {}

  async quote(input: CreateOrderDto, passenger: AuthenticatedUser) {
    this.assertRole(passenger, UserRole.Passenger);
    const now = new Date();
    const scheduledFor = input.scheduledFor
      ? this.validateScheduledFor(input.scheduledFor, now)
      : null;
    const quote = await this.tariffs.quote({
      kind: input.kind,
      pickup: input.pickup,
      destination: input.destination,
      basisTime: scheduledFor ?? now,
      roundTrip: input.roundTrip,
      routeDistanceMeters: input.routeDistanceMeters,
    });
    return {
      fareAmount: quote.fareAmount,
      tariffPeriod: quote.period,
      pickupZone: quote.pickupZone,
      destinationZone: quote.destinationZone,
      roadSurchargeAmount: quote.roadSurchargeAmount,
      tariffVersion: quote.settingVersion,
      pricingMode: quote.pricingMode,
      routeDistanceMeters: quote.routeDistanceMeters,
      distanceRatePerKm: quote.distanceRatePerKm,
    };
  }

  async getAvailability(kind: OrderKind, passenger: AuthenticatedUser) {
    this.assertRole(passenger, UserRole.Passenger);
    const availableDrivers = await this.driverWork.countAvailableDrivers(kind);
    const isNight = this.isNightTime(new Date());
    return {
      availableDrivers,
      hasAvailableDrivers: availableDrivers > 0,
      waitMinutes: availableDrivers === 0 && isNight ? 10 : 0,
    };
  }

  async create(
    input: CreateOrderDto,
    passenger: AuthenticatedUser,
  ): Promise<ReturnType<OrdersService['toResponse']>> {
    this.assertRole(passenger, UserRole.Passenger);
    const now = new Date();
    const scheduledFor = input.scheduledFor
      ? this.validateScheduledFor(input.scheduledFor, now)
      : null;
    const quote = await this.tariffs.quote({
      kind: input.kind,
      pickup: input.pickup,
      destination: input.destination,
      basisTime: scheduledFor ?? now,
      roundTrip: input.roundTrip,
      routeDistanceMeters: input.routeDistanceMeters,
    });

    let orderId: string;
    try {
      orderId = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(OrderEntity);
        const activeOrder = await repository.findOneBy({
          passengerUserId: passenger.userId,
          status: In([...PASSENGER_ACTIVE_STATUSES]),
        });
        if (activeOrder) {
          throw this.passengerAlreadyHasActiveOrder();
        }
        const order = await repository.save(
          repository.create({
            passengerUserId: passenger.userId,
            driverUserId: null,
            kind: input.kind,
            paymentMethod: input.paymentMethod,
            passengerCount: input.passengerCount,
            roundTrip: input.roundTrip,
            pickupAddress: input.pickup.address.trim(),
            pickupPoint: this.point(input.pickup),
            pickupZone: quote.pickupZone,
            destinationAddress: input.destination.address.trim(),
            destinationPoint: this.point(input.destination),
            destinationZone: quote.destinationZone,
            scheduledFor,
            scheduledAnnouncedAt: null,
            scheduledOneHourNotifiedAt: null,
            scheduledFifteenMinutesNotifiedAt: null,
            scheduledFiveMinutesNotifiedAt: null,
            tariffSettingId: quote.settingId,
            tariffVersion: quote.settingVersion,
            pricingMode: quote.pricingMode,
            routeDistanceMeters: quote.routeDistanceMeters,
            distanceRatePerKm: quote.distanceRatePerKm,
            fareAmount: quote.fareAmount,
            tariffPeriod: quote.period,
            roadSurchargeAmount: quote.roadSurchargeAmount,
            status: OrderStatus.Open,
            acceptedAt: null,
            driverEnRouteAt: null,
            arrivedAt: null,
            startedAt: null,
            waitingStartedAt: null,
            waitingChargeAmount: 0,
            cancellationFeeAmount: 0,
            arrivalNotifiedAt: null,
            completedAt: null,
            canceledAt: null,
            canceledByUserId: null,
            cancellationReason: null,
            cancellationReasonCode: null,
          }),
        );
        await this.recordTransition(
          manager,
          order,
          passenger,
          null,
          OrderStatus.Open,
          undefined,
          scheduledFor === null,
        );
        return order.id;
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw this.passengerAlreadyHasActiveOrder();
      }
      throw error;
    }

    return this.getOrder(orderId);
  }

  async listBoard(
    query: ListOrderBoardDto,
    driver: AuthenticatedUser,
  ): Promise<{
    items: Array<ReturnType<OrdersService['toResponse']>>;
    page: number;
    pageSize: number;
    total: number;
    visibilityDelaySeconds: number;
    announcement: string;
    reservations: Array<ReturnType<OrdersService['toResponse']>>;
  }> {
    const boardAccess = await this.driverWork.assertCanViewBoard(driver);
    const settings = await this.serviceSettings.get();
    const visibleBefore = new Date(
      Date.now() - boardAccess.visibilityDelaySeconds * 1000,
    );
    const [orders, total] = await this.orders
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.passenger', 'passenger')
      .leftJoinAndSelect('order.driver', 'driver')
      .where('order.status = :status', { status: OrderStatus.Open })
      .andWhere('order.kind IN (:...acceptedKinds)', {
        acceptedKinds: boardAccess.acceptedKinds,
      })
      .andWhere('order.created_at <= :visibleBefore', { visibleBefore })
      .orderBy('order.scheduledFor', 'ASC', 'NULLS FIRST')
      .addOrderBy('order.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
    const reservations = await this.findDriverReservations(driver.userId);
    return {
      items: orders.map((order) => this.toResponse(order)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      visibilityDelaySeconds: boardAccess.visibilityDelaySeconds,
      announcement: settings.driverBoardAnnouncement,
      reservations: reservations.map((order) => this.toResponse(order)),
    };
  }

  async getActive(
    currentUser: AuthenticatedUser,
  ): Promise<ReturnType<OrdersService['toResponse']> | null> {
    let order: OrderEntity | null;
    if (currentUser.role === UserRole.Passenger) {
      order = await this.orders.findOne({
        where: {
          passengerUserId: currentUser.userId,
          status: In([...PASSENGER_ACTIVE_STATUSES]),
        },
        relations: {
          passenger: true,
          driver: { driverProfile: true },
        },
        order: { createdAt: 'DESC' },
      });
    } else if (currentUser.role === UserRole.Driver) {
      await this.driverWork.assertApprovedDriver(currentUser);
      const activeBefore = new Date(
        Date.now() + SCHEDULED_ACCEPT_BLOCK_MINUTES * 60_000,
      );
      order = await this.orders
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.passenger', 'passenger')
        .leftJoinAndSelect('order.driver', 'driver')
        .leftJoinAndSelect('driver.driverProfile', 'driverProfile')
        .where('order.driverUserId = :driverUserId', {
          driverUserId: currentUser.userId,
        })
        .andWhere(
          new Brackets((query) => {
            query
              .where('order.status IN (:...drivingStatuses)', {
                drivingStatuses: DRIVING_ORDER_STATUSES,
              })
              .orWhere(
                `(
                  order.status = :acceptedStatus
                  AND (
                    order.scheduledFor IS NULL
                    OR order.scheduledFor <= :activeBefore
                  )
                )`,
                {
                  acceptedStatus: OrderStatus.Accepted,
                  activeBefore,
                },
              );
          }),
        )
        .addSelect(
          `CASE
            WHEN order.status IN ('driver_en_route', 'arrived', 'waiting', 'started')
              THEN 0
            ELSE 1
          END`,
          'active_order_priority',
        )
        .orderBy('active_order_priority', 'ASC')
        .addOrderBy('order.scheduledFor', 'ASC', 'NULLS FIRST')
        .addOrderBy('order.createdAt', 'DESC')
        .getOne();
    } else {
      throw this.roleForbidden();
    }
    return order ? this.toResponse(order) : null;
  }

  async listDriverReservations(driver: AuthenticatedUser) {
    await this.driverWork.assertApprovedDriver(driver);
    const orders = await this.findDriverReservations(driver.userId);
    return { items: orders.map((order) => this.toResponse(order)) };
  }

  async assertTrackingAccess(
    orderId: string,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const ownership =
      currentUser.role === UserRole.Passenger
        ? { passengerUserId: currentUser.userId }
        : currentUser.role === UserRole.Driver
          ? { driverUserId: currentUser.userId }
          : null;
    if (ownership === null) {
      throw this.roleForbidden();
    }
    if (currentUser.role === UserRole.Driver) {
      await this.driverWork.assertApprovedDriver(currentUser);
    }

    const order = await this.orders.findOne({
      where: {
        id: orderId,
        ...ownership,
        status: In([...PASSENGER_ACTIVE_STATUSES]),
      },
      select: { id: true },
    });
    if (!order) {
      throw this.orderNotFound();
    }
  }

  async accept(
    orderId: string,
    driver: AuthenticatedUser,
  ): Promise<ReturnType<OrdersService['toResponse']>> {
    await this.driverWork.assertCanAcceptOrders(driver);
    const visibilityDelaySeconds =
      await this.driverWork.getVisibilityDelaySeconds(driver.userId);
    try {
      await this.dataSource.transaction(async (manager) => {
        const acceptedKinds = await this.driverWork.lockAvailableShiftForAccept(
          manager,
          driver,
        );
        const repository = manager.getRepository(OrderEntity);
        const now = new Date();
        const blockBefore = new Date(
          now.getTime() + SCHEDULED_ACCEPT_BLOCK_MINUTES * 60_000,
        );
        const order = await repository
          .createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :orderId', { orderId })
          .getOne();
        if (!order) {
          throw this.orderNotFound();
        }
        if (order.status !== OrderStatus.Open) {
          throw new ConflictException({
            code: 'ORDER_NOT_AVAILABLE',
            message: 'Order has already been accepted or closed',
          });
        }
        const visibleAt = new Date(
          order.createdAt.getTime() + visibilityDelaySeconds * 1000,
        );
        if (visibleAt > now) {
          throw new ConflictException({
            code: 'ORDER_NOT_YET_VISIBLE',
            message: 'This order is not available to this driver yet',
          });
        }
        if (!acceptedKinds.includes(order.kind)) {
          throw new ConflictException({
            code: 'ORDER_KIND_DISABLED',
            message: 'This order kind is disabled in driver settings',
          });
        }
        const drivingOrder = await repository
          .createQueryBuilder('active')
          .setLock('pessimistic_write')
          .where('active.driverUserId = :driverUserId', {
            driverUserId: driver.userId,
          })
          .andWhere('active.status IN (:...drivingStatuses)', {
            drivingStatuses: DRIVING_ORDER_STATUSES,
          })
          .getOne();
        const blockingAcceptedOrder = await repository
          .createQueryBuilder('reserved')
          .setLock('pessimistic_write')
          .where('reserved.driverUserId = :driverUserId', {
            driverUserId: driver.userId,
          })
          .andWhere('reserved.status = :acceptedStatus', {
            acceptedStatus: OrderStatus.Accepted,
          })
          .andWhere(
            new Brackets((query) => {
              query
                .where('reserved.scheduledFor IS NULL')
                .orWhere('reserved.scheduledFor <= :blockBefore', {
                  blockBefore,
                });
            }),
          )
          .getOne();
        const hasActiveOrder =
          drivingOrder !== null || blockingAcceptedOrder !== null;
        const canReserveScheduledDuringActive =
          order.scheduledFor !== null &&
          order.scheduledFor >
            new Date(
              now.getTime() + SCHEDULED_RESERVATION_CONFLICT_MINUTES * 60_000,
            );
        if (hasActiveOrder && order.scheduledFor === null) {
          if (!drivingOrder) {
            throw new ConflictException({
              code: 'DRIVER_ALREADY_HAS_ACTIVE_ORDER',
              message:
                'Сначала начните выполнение принятого заказа, затем можно выбрать следующий.',
            });
          }
          if (blockingAcceptedOrder) {
            throw new ConflictException({
              code: 'DRIVER_NEXT_ORDER_ALREADY_RESERVED',
              message: 'Следующий заказ уже выбран.',
            });
          }
          await this.assertNearestNextOrder(
            repository,
            order,
            drivingOrder,
            acceptedKinds,
            new Date(now.getTime() - visibilityDelaySeconds * 1000),
          );
        } else if (hasActiveOrder && !canReserveScheduledDuringActive) {
          throw new ConflictException({
            code: 'DRIVER_ALREADY_HAS_ACTIVE_ORDER',
            message: 'Driver already has an active order',
          });
        }
        if (order.scheduledFor) {
          const conflictFrom = new Date(
            order.scheduledFor.getTime() -
              SCHEDULED_RESERVATION_CONFLICT_MINUTES * 60_000,
          );
          const conflictTo = new Date(
            order.scheduledFor.getTime() +
              SCHEDULED_RESERVATION_CONFLICT_MINUTES * 60_000,
          );
          const conflictingReservation = await repository
            .createQueryBuilder('reservation')
            .where('reservation.driverUserId = :driverUserId', {
              driverUserId: driver.userId,
            })
            .andWhere('reservation.status = :accepted', {
              accepted: OrderStatus.Accepted,
            })
            .andWhere('reservation.scheduledFor BETWEEN :from AND :to', {
              from: conflictFrom,
              to: conflictTo,
            })
            .getOne();
          if (conflictingReservation) {
            throw new ConflictException({
              code: 'SCHEDULED_ORDER_CONFLICT',
              message:
                'Another scheduled order is too close to the selected time',
            });
          }
        }

        order.driverUserId = driver.userId;
        order.status = OrderStatus.Accepted;
        order.acceptedAt = new Date();
        await repository.save(order);
        await this.recordTransition(
          manager,
          order,
          driver,
          OrderStatus.Open,
          OrderStatus.Accepted,
        );
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DRIVER_ALREADY_HAS_ACTIVE_ORDER',
          message: 'Driver already has an active order',
        });
      }
      throw error;
    }
    return this.getOrder(orderId);
  }

  async updateStatus(
    orderId: string,
    nextStatus: OrderStatus,
    driver: AuthenticatedUser,
    completionLocation?: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      recordedAt: string;
    },
  ): Promise<ReturnType<OrdersService['toResponse']>> {
    await this.driverWork.assertApprovedDriver(driver);
    const settings =
      nextStatus === OrderStatus.Waiting || nextStatus === OrderStatus.Started
        ? await this.serviceSettings.get()
        : null;
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OrderEntity);
      const order = await repository
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :orderId', { orderId })
        .andWhere('order.driverUserId = :driverId', {
          driverId: driver.userId,
        })
        .getOne();
      if (!order) {
        throw this.orderNotFound();
      }
      // Repeated delivery of the same status is safe and should not turn a
      // successful first tap into an error on a retry or double tap.
      if (order.status === nextStatus) {
        return;
      }
      if (
        nextStatus === OrderStatus.DriverEnRoute &&
        order.scheduledFor &&
        order.scheduledFor > new Date(Date.now() + 15 * 60_000)
      ) {
        throw new ConflictException({
          code: 'SCHEDULED_ORDER_TOO_EARLY',
          message:
            'A scheduled order can be started no earlier than 15 minutes before pickup',
        });
      }
      const allowed = DRIVER_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(nextStatus)) {
        throw new ConflictException({
          code: 'ORDER_STATUS_TRANSITION_INVALID',
          message: `Cannot change order from ${order.status} to ${nextStatus}`,
        });
      }

      if (nextStatus === OrderStatus.Completed) {
        await this.assertDriverNearCompletionPoint(
          order,
          driver.userId,
          completionLocation,
        );
      }

      const previousStatus = order.status;
      order.status = nextStatus;
      this.setStatusTimestamp(order, nextStatus);
      if (nextStatus === OrderStatus.Waiting && settings) {
        this.startPaidWaiting(order, settings.waitingBaseFee);
      }
      if (
        nextStatus === OrderStatus.Started &&
        order.waitingStartedAt &&
        settings
      ) {
        this.applyWaitingCharge(
          order,
          settings.freeWaitingMinutes,
          settings.waitingBaseFee,
          settings.waitingPricePerMinute,
        );
      }
      if (nextStatus === OrderStatus.Completed) {
        await this.finance.accrueCommissionForCompletedOrder(manager, order);
      }
      await repository.save(order);
      await this.recordTransition(
        manager,
        order,
        driver,
        previousStatus,
        nextStatus,
      );
    });
    return this.getOrder(orderId);
  }

  async getTransferDetails(orderId: string, passenger: AuthenticatedUser) {
    return this.finance.getTransferDetailsForPassenger(orderId, passenger);
  }

  async releaseStaleAcceptedOrders(): Promise<number> {
    const settings = await this.serviceSettings.get();
    const cutoff = new Date(
      Date.now() - settings.acceptedOrderTimeoutSeconds * 1000,
    );
    const candidates = await this.orders.find({
      where: {
        status: OrderStatus.Accepted,
        acceptedAt: LessThanOrEqual(cutoff),
      },
      select: { id: true },
      take: 100,
    });
    let released = 0;

    for (const candidate of candidates) {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(OrderEntity);
        const order = await repository
          .createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :orderId', { orderId: candidate.id })
          .getOne();
        if (
          !order ||
          order.status !== OrderStatus.Accepted ||
          !order.acceptedAt ||
          order.acceptedAt > cutoff ||
          !order.driverUserId
        ) {
          return;
        }

        const driverUserId = order.driverUserId;
        order.status = OrderStatus.Open;
        order.driverUserId = null;
        order.acceptedAt = null;
        await repository.save(order);
        await this.recordTransition(
          manager,
          order,
          {
            userId: driverUserId,
            sessionId: 'system-timeout',
            role: UserRole.Driver,
          },
          OrderStatus.Accepted,
          OrderStatus.Open,
          'Driver did not start moving before the timeout',
        );
        released++;
      });
    }
    return released;
  }

  async announceDueScheduledOrders(): Promise<number> {
    const now = new Date();
    const candidates = await this.orders.find({
      where: {
        status: OrderStatus.Open,
        scheduledFor: LessThanOrEqual(now),
        scheduledAnnouncedAt: IsNull(),
      },
      select: { id: true },
      take: 100,
    });
    let announced = 0;

    for (const candidate of candidates) {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(OrderEntity);
        const order = await repository
          .createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :orderId', { orderId: candidate.id })
          .getOne();
        if (
          !order ||
          order.status !== OrderStatus.Open ||
          !order.scheduledFor ||
          order.scheduledFor > now ||
          order.scheduledAnnouncedAt
        ) {
          return;
        }
        order.scheduledAnnouncedAt = now;
        await repository.save(order);
        await this.outbox.enqueue(
          {
            aggregateType: 'order',
            aggregateId: order.id,
            eventType: 'order.created',
            payload: {
              orderId: order.id,
              passengerUserId: order.passengerUserId,
              driverUserId: null,
              previousStatus: null,
              nextStatus: OrderStatus.Open,
            },
          },
          manager,
        );
        announced++;
      });
    }
    return announced;
  }

  async sendScheduledReminders(): Promise<number> {
    const now = new Date();
    const candidates = await this.orders.find({
      where: {
        status: OrderStatus.Accepted,
        scheduledFor: LessThanOrEqual(new Date(now.getTime() + 60 * 60_000)),
      },
      select: { id: true },
      take: 100,
    });
    let sent = 0;
    for (const candidate of candidates) {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(OrderEntity);
        const order = await repository
          .createQueryBuilder('order')
          .setLock('pessimistic_write')
          .where('order.id = :id', { id: candidate.id })
          .getOne();
        if (
          !order ||
          order.status !== OrderStatus.Accepted ||
          !order.driverUserId ||
          !order.scheduledFor ||
          order.scheduledFor <= now
        ) {
          return;
        }
        const minutes = Math.ceil(
          (order.scheduledFor.getTime() - now.getTime()) / 60_000,
        );
        let reminderMinutes: 5 | 15 | 60 | null = null;
        if (minutes <= 5 && !order.scheduledFiveMinutesNotifiedAt) {
          reminderMinutes = 5;
          order.scheduledOneHourNotifiedAt ??= now;
          order.scheduledFifteenMinutesNotifiedAt ??= now;
          order.scheduledFiveMinutesNotifiedAt = now;
        } else if (minutes <= 15 && !order.scheduledFifteenMinutesNotifiedAt) {
          reminderMinutes = 15;
          order.scheduledOneHourNotifiedAt ??= now;
          order.scheduledFifteenMinutesNotifiedAt = now;
        } else if (minutes <= 60 && !order.scheduledOneHourNotifiedAt) {
          reminderMinutes = 60;
          order.scheduledOneHourNotifiedAt = now;
        }
        if (reminderMinutes === null) {
          return;
        }
        await repository.save(order);
        await this.outbox.enqueue(
          {
            aggregateType: 'order',
            aggregateId: order.id,
            eventType: 'order.scheduled_reminder',
            payload: {
              orderId: order.id,
              driverUserId: order.driverUserId,
              reminderMinutes,
            },
          },
          manager,
        );
        sent++;
      });
    }
    return sent;
  }

  async markArrivalSoon(
    orderId: string,
    driver: AuthenticatedUser,
    etaSeconds: number,
  ): Promise<void> {
    const settings = await this.serviceSettings.get();
    if (
      !Number.isFinite(etaSeconds) ||
      etaSeconds < 0 ||
      etaSeconds > settings.arrivalSoonMinutes * 60
    ) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OrderEntity);
      const order = await repository
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :orderId', { orderId })
        .andWhere('order.driverUserId = :driverUserId', {
          driverUserId: driver.userId,
        })
        .getOne();
      if (
        !order ||
        order.arrivalNotifiedAt ||
        ![OrderStatus.Accepted, OrderStatus.DriverEnRoute].includes(
          order.status,
        )
      ) {
        return;
      }
      order.arrivalNotifiedAt = new Date();
      await repository.save(order);
      await this.outbox.enqueue(
        {
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'order.approaching',
          payload: {
            orderId: order.id,
            passengerUserId: order.passengerUserId,
            driverUserId: order.driverUserId,
            etaSeconds,
            arrivalSoonMinutes: settings.arrivalSoonMinutes,
          },
        },
        manager,
      );
    });
  }

  async cancel(
    orderId: string,
    input: CancelOrderDto,
    currentUser: AuthenticatedUser,
  ): Promise<ReturnType<OrdersService['toResponse']>> {
    if (currentUser.role === UserRole.Driver) {
      await this.driverWork.assertApprovedDriver(currentUser);
    } else {
      this.assertRole(currentUser, UserRole.Passenger);
    }

    const reason = input.reason.trim();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OrderEntity);
      const order = await repository
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :orderId', { orderId })
        .getOne();
      if (!order) {
        throw this.orderNotFound();
      }
      const isOwner =
        (currentUser.role === UserRole.Passenger &&
          order.passengerUserId === currentUser.userId) ||
        (currentUser.role === UserRole.Driver &&
          order.driverUserId === currentUser.userId);
      if (!isOwner) {
        throw this.orderNotFound();
      }
      if (
        order.status === OrderStatus.Completed ||
        order.status === OrderStatus.Canceled
      ) {
        throw new ConflictException({
          code: 'ORDER_CANNOT_BE_CANCELED',
          message: 'Order is already closed',
        });
      }

      const previousStatus = order.status;
      order.status = OrderStatus.Canceled;
      order.canceledAt = new Date();
      order.canceledByUserId = currentUser.userId;
      order.cancellationReason = reason;
      order.cancellationReasonCode = input.reasonCode?.trim() || null;
      order.cancellationFeeAmount =
        currentUser.role === UserRole.Passenger
          ? this.passengerCancellationFee(order)
          : 0;
      await repository.save(order);
      await this.recordTransition(
        manager,
        order,
        currentUser,
        previousStatus,
        OrderStatus.Canceled,
        reason,
      );
    });
    return this.getOrder(orderId);
  }

  private async getOrder(
    orderId: string,
  ): Promise<ReturnType<OrdersService['toResponse']>> {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: {
        passenger: true,
        driver: { driverProfile: true },
      },
    });
    if (!order) {
      throw this.orderNotFound();
    }
    return this.toResponse(order);
  }

  private async recordTransition(
    manager: EntityManager,
    order: OrderEntity,
    actor: AuthenticatedUser,
    previousStatus: OrderStatus | null,
    nextStatus: OrderStatus,
    reason?: string,
    notify = true,
  ): Promise<void> {
    await manager.getRepository(OrderStatusHistoryEntity).save({
      orderId: order.id,
      actorUserId: actor.userId,
      previousStatus,
      nextStatus,
      reason: reason ?? null,
    });
    const metadata = { previousStatus, nextStatus };
    await this.activityEvents.record(
      {
        eventType:
          previousStatus === null ? 'order_created' : 'order_status_changed',
        actorUserId: actor.userId,
        entityType: 'order',
        entityId: order.id,
        metadata: reason ? { ...metadata, reason } : metadata,
      },
      manager,
    );
    if (!notify) {
      return;
    }
    await this.outbox.enqueue(
      {
        aggregateType: 'order',
        aggregateId: order.id,
        eventType:
          previousStatus === null ? 'order.created' : 'order.status_changed',
        payload: {
          orderId: order.id,
          passengerUserId: order.passengerUserId,
          driverUserId: order.driverUserId,
          ...metadata,
        },
      },
      manager,
    );
  }

  private async findDriverReservations(
    driverUserId: string,
  ): Promise<OrderEntity[]> {
    const now = new Date();
    return this.orders
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.passenger', 'passenger')
      .leftJoinAndSelect('reservation.driver', 'driver')
      .leftJoinAndSelect('driver.driverProfile', 'driverProfile')
      .where('reservation.driverUserId = :driverUserId', { driverUserId })
      .andWhere('reservation.status = :status', {
        status: OrderStatus.Accepted,
      })
      .andWhere(
        new Brackets((query) => {
          query.where('reservation.scheduledFor > :now', { now }).orWhere(
            `(
                reservation.scheduledFor IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM orders driving
                  WHERE driving.driver_user_id = :driverUserId
                    AND driving.status IN (
                      'driver_en_route',
                      'arrived',
                      'waiting',
                      'started'
                    )
                )
              )`,
          );
        }),
      )
      .addSelect(
        'CASE WHEN reservation.scheduledFor IS NULL THEN 0 ELSE 1 END',
        'reservation_priority',
      )
      .orderBy('reservation_priority', 'ASC')
      .addOrderBy('reservation.scheduledFor', 'ASC', 'NULLS FIRST')
      .addOrderBy('reservation.createdAt', 'ASC')
      .take(20)
      .getMany();
  }

  private async assertNearestNextOrder(
    repository: Repository<OrderEntity>,
    selectedOrder: OrderEntity,
    activeOrder: OrderEntity,
    acceptedKinds: OrderKind[],
    visibleBefore: Date,
  ): Promise<void> {
    const candidates = await repository
      .createQueryBuilder('candidate')
      .where('candidate.status = :status', { status: OrderStatus.Open })
      .andWhere('candidate.scheduledFor IS NULL')
      .andWhere('candidate.kind IN (:...acceptedKinds)', { acceptedKinds })
      .andWhere('candidate.createdAt <= :visibleBefore', { visibleBefore })
      .orderBy('candidate.createdAt', 'DESC')
      .getMany();
    const destination = activeOrder.destinationPoint.coordinates;
    let nearest: OrderEntity | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const pickup = candidate.pickupPoint.coordinates;
      const distance = this.distanceMeters(
        destination[1],
        destination[0],
        pickup[1],
        pickup[0],
      );
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (nearest?.id !== selectedOrder.id) {
      throw new ConflictException({
        code: 'ORDER_NOT_NEAREST',
        message:
          'Этот заказ уже не ближайший. Обновите доску и выберите отмеченный заказ.',
      });
    }
  }

  private toResponse(order: OrderEntity) {
    return {
      id: order.id,
      status: order.status,
      kind: order.kind,
      paymentMethod: order.paymentMethod,
      passengerCount: order.passengerCount,
      roundTrip: order.roundTrip,
      pickup: {
        address: order.pickupAddress,
        latitude: order.pickupPoint.coordinates[1],
        longitude: order.pickupPoint.coordinates[0],
        zone: order.pickupZone,
      },
      destination: {
        address: order.destinationAddress,
        latitude: order.destinationPoint.coordinates[1],
        longitude: order.destinationPoint.coordinates[0],
        zone: order.destinationZone,
      },
      scheduledFor: order.scheduledFor,
      fareAmount: order.fareAmount,
      tariffPeriod: order.tariffPeriod,
      roadSurchargeAmount: order.roadSurchargeAmount,
      tariffVersion: order.tariffVersion,
      pricingMode: order.pricingMode ?? OrderPricingMode.Fixed,
      routeDistanceMeters: order.routeDistanceMeters,
      distanceRatePerKm: order.distanceRatePerKm,
      passenger: {
        id: order.passenger.id,
        name: order.passenger.name,
      },
      driver: order.driver
        ? {
            id: order.driver.id,
            name: order.driver.name,
            vehicle: order.driver.driverProfile
              ? {
                  makeModel: order.driver.driverProfile.vehicleMakeModel,
                  color: order.driver.driverProfile.vehicleColor,
                  plate: order.driver.driverProfile.vehiclePlate,
                }
              : null,
          }
        : null,
      acceptedAt: order.acceptedAt,
      driverEnRouteAt: order.driverEnRouteAt,
      arrivedAt: order.arrivedAt,
      startedAt: order.startedAt,
      waitingStartedAt: order.waitingStartedAt,
      waitingChargeAmount: order.waitingChargeAmount,
      cancellationFeeAmount: order.cancellationFeeAmount,
      completedAt: order.completedAt,
      canceledAt: order.canceledAt,
      cancellationReason: order.cancellationReason,
      cancellationReasonCode: order.cancellationReasonCode,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async assertDriverNearCompletionPoint(
    order: OrderEntity,
    driverUserId: string,
    completionLocation?: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      recordedAt: string;
    },
  ): Promise<void> {
    let snapshot: {
      driverUserId?: string;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      recordedAt?: string;
    };
    if (completionLocation) {
      snapshot = {
        driverUserId,
        ...completionLocation,
      };
    } else {
      const raw = await this.redis.connection.get(
        `tracking:order:${order.id}:driver`,
      );
      if (!raw) {
        throw this.completionLocationRequired();
      }
      try {
        snapshot = JSON.parse(raw) as typeof snapshot;
      } catch {
        throw this.completionLocationRequired();
      }
    }

    const recordedAtMs = snapshot.recordedAt
      ? new Date(snapshot.recordedAt).getTime()
      : Number.NaN;
    if (
      !Number.isFinite(snapshot.latitude) ||
      !Number.isFinite(snapshot.longitude) ||
      snapshot.driverUserId !== driverUserId ||
      !Number.isFinite(recordedAtMs) ||
      Date.now() - recordedAtMs > 45_000 ||
      recordedAtMs - Date.now() > 10_000
    ) {
      throw this.completionLocationRequired();
    }

    const destination = order.destinationPoint;
    const distanceMeters = this.distanceMeters(
      snapshot.latitude,
      snapshot.longitude,
      destination.coordinates[1],
      destination.coordinates[0],
    );
    const radiusMeters = this.config.get<number>(
      'ORDER_COMPLETION_RADIUS_METERS',
      300,
    );
    const accuracyAllowanceMeters = Math.min(
      Math.max(snapshot.accuracyMeters ?? 0, 0),
      50,
    );
    const effectiveRadiusMeters = radiusMeters + accuracyAllowanceMeters;
    if (distanceMeters > effectiveRadiusMeters) {
      throw new ConflictException({
        code: 'ORDER_COMPLETION_TOO_FAR',
        message: `До конечной точки ещё ${Math.round(distanceMeters)} м. Завершить поездку можно в радиусе ${Math.round(effectiveRadiusMeters)} м.`,
        details: {
          driverUserId,
          distanceMeters: Math.round(distanceMeters),
          allowedRadiusMeters: radiusMeters,
          locationAccuracyMeters: Math.round(snapshot.accuracyMeters ?? 0),
          effectiveRadiusMeters: Math.round(effectiveRadiusMeters),
        },
      });
    }
  }

  private completionLocationRequired(): ConflictException {
    return new ConflictException({
      code: 'ORDER_COMPLETION_LOCATION_REQUIRED',
      message:
        'Не удалось получить свежую геопозицию. Включите точную геолокацию и повторите попытку.',
    });
  }

  private distanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ): number {
    const earthRadiusMeters = 6_371_000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(latitudeB - latitudeA);
    const longitudeDelta = toRadians(longitudeB - longitudeA);
    const startLatitude = toRadians(latitudeA);
    const endLatitude = toRadians(latitudeB);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(startLatitude) *
        Math.cos(endLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;
    return (
      2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }

  private validateScheduledFor(value: string, now: Date): Date {
    const scheduledFor = new Date(value);
    const latest = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (scheduledFor <= now || scheduledFor > latest) {
      throw new ConflictException({
        code: 'SCHEDULED_TIME_INVALID',
        message: 'Scheduled time must be within the next 30 days',
      });
    }
    return scheduledFor;
  }

  private isNightTime(value: Date): boolean {
    const timeZone = this.config.getOrThrow<string>('BUSINESS_TIME_ZONE');
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .find((part) => part.type === 'hour');
    const hour = Number(hourPart?.value ?? 0);
    return hour >= 21 || hour < 6;
  }

  private point(input: { latitude: number; longitude: number }): Point {
    return {
      type: 'Point',
      coordinates: [input.longitude, input.latitude],
    };
  }

  private assertRole(currentUser: AuthenticatedUser, role: UserRole): void {
    if (currentUser.role !== role) {
      throw this.roleForbidden();
    }
  }

  private roleForbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'ORDER_ROLE_FORBIDDEN',
      message: 'This account cannot perform the order action',
    });
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Order was not found',
    });
  }

  private passengerAlreadyHasActiveOrder(): ConflictException {
    return new ConflictException({
      code: 'PASSENGER_ALREADY_HAS_ACTIVE_ORDER',
      message: 'Cancel or finish the active order before creating another one',
    });
  }

  private passengerCancellationFee(order: OrderEntity): number {
    const elapsedMinutes = Math.floor(
      (Date.now() - order.createdAt.getTime()) / 60_000,
    );
    if (elapsedMinutes <= PASSENGER_CANCELLATION_FREE_MINUTES) {
      return 0;
    }
    if (elapsedMinutes < PASSENGER_CANCELLATION_SMALL_FEE_UNTIL_MINUTES) {
      return PASSENGER_CANCELLATION_SMALL_FEE;
    }
    if (elapsedMinutes < PASSENGER_CANCELLATION_FULL_FARE_AFTER_MINUTES) {
      return PASSENGER_CANCELLATION_MEDIUM_FEE;
    }
    return order.fareAmount;
  }

  private setStatusTimestamp(order: OrderEntity, status: OrderStatus): void {
    const now = new Date();
    switch (status) {
      case OrderStatus.DriverEnRoute:
        order.driverEnRouteAt = now;
        break;
      case OrderStatus.Arrived:
        order.arrivedAt = now;
        break;
      case OrderStatus.Waiting:
        order.waitingStartedAt = now;
        break;
      case OrderStatus.Started:
        order.startedAt = now;
        break;
      case OrderStatus.Completed:
        order.completedAt = now;
        break;
      default:
        break;
    }
  }

  private applyWaitingCharge(
    order: OrderEntity,
    includedMinutes: number,
    baseFee: number,
    pricePerMinute: number,
  ): void {
    if (!order.waitingStartedAt) {
      return;
    }
    const elapsedMinutes = Math.floor(
      (Date.now() - order.waitingStartedAt.getTime()) / 60_000,
    );
    const paidMinutes = Math.max(0, elapsedMinutes - includedMinutes);
    const nextCharge = baseFee + paidMinutes * pricePerMinute;
    const difference = nextCharge - order.waitingChargeAmount;
    if (difference > 0) {
      order.fareAmount += difference;
      order.waitingChargeAmount = nextCharge;
    }
  }

  private startPaidWaiting(order: OrderEntity, baseFee: number): void {
    if (baseFee <= order.waitingChargeAmount) {
      return;
    }
    const difference = baseFee - order.waitingChargeAmount;
    order.fareAmount += difference;
    order.waitingChargeAmount = baseFee;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return (error.driverError as { code?: unknown }).code === '23505';
  }
}
