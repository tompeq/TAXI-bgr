import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrderEntity } from '../orders/order.entity';
import { OrderKind } from '../orders/order-kind.enum';
import {
  ACTIVE_DRIVER_ORDER_STATUSES,
  OrderStatus,
} from '../orders/order-status.enum';
import { OutboxService } from '../outbox/outbox.service';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { UserRole } from '../users/user-role.enum';
import { FinanceService } from '../finance/finance.service';
import { DriverShiftEntity } from './driver-shift.entity';
import { DriverWorkSettingsEntity } from './driver-work-settings.entity';
import { DriverWorkStatus } from './driver-work-status.enum';
import { StartBreakDto } from './dto/start-break.dto';
import { UpdateDriverWorkSettingsDto } from './dto/update-driver-work-settings.dto';

const BOARD_DELAY_SECONDS = 25;
const HIGH_INCOME_RATIO = 1.2;
const COMMISSION_DEBT_NOTICE_THRESHOLD = 1_000;
const COMMISSION_DEBT_REMINDER_THRESHOLD = 3_000;
const COMMISSION_DEBT_BLOCK_THRESHOLD = 5_000;

export interface DriverBoardAccess {
  acceptedKinds: OrderKind[];
  visibilityDelaySeconds: number;
}

@Injectable()
export class DriverWorkService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventsService,
    private readonly outbox: OutboxService,
    private readonly finance: FinanceService,
    @InjectRepository(DriverShiftEntity)
    private readonly shifts: Repository<DriverShiftEntity>,
    @InjectRepository(DriverWorkSettingsEntity)
    private readonly settings: Repository<DriverWorkSettingsEntity>,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfiles: Repository<DriverProfileEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
  ) {}

  async getState(driver: AuthenticatedUser) {
    await this.assertApprovedDriver(driver);
    const [shift, settings, earnings24h, commissionDebt] = await Promise.all([
      this.getNormalizedActiveShift(driver.userId),
      this.getOrCreateSettings(driver.userId),
      this.getEarnings24h(driver.userId),
      this.finance.getCommissionDebt(driver.userId),
    ]);
    const visibilityDelaySeconds =
      shift?.status === DriverWorkStatus.Online
        ? await this.calculateVisibilityDelay(driver.userId)
        : 0;
    return this.toState(
      shift,
      settings,
      earnings24h,
      commissionDebt,
      visibilityDelaySeconds,
    );
  }

  async start(driver: AuthenticatedUser) {
    await this.assertCanAcceptOrders(driver);
    await this.getOrCreateSettings(driver.userId);
    const existing = await this.getNormalizedActiveShift(driver.userId);
    if (existing) {
      return this.getState(driver);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const shifts = manager.getRepository(DriverShiftEntity);
        const shift = await shifts.save(
          shifts.create({
            driverUserId: driver.userId,
            status: DriverWorkStatus.Online,
            breakUntil: null,
            endedAt: null,
          }),
        );
        await this.recordWorkEvent(
          manager,
          driver,
          shift,
          'driver.shift_started',
        );
      });
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
    }
    return this.getState(driver);
  }

  async end(driver: AuthenticatedUser) {
    await this.assertApprovedDriver(driver);
    await this.dataSource.transaction(async (manager) => {
      const shift = await this.lockActiveShift(manager, driver.userId);
      if (!shift) {
        return;
      }
      await this.assertNoActiveOrder(manager, driver.userId);
      shift.status = DriverWorkStatus.Online;
      shift.breakUntil = null;
      shift.endedAt = new Date();
      await manager.getRepository(DriverShiftEntity).save(shift);
      await this.recordWorkEvent(manager, driver, shift, 'driver.shift_ended');
    });
    return this.getState(driver);
  }

  async startBreak(driver: AuthenticatedUser, input: StartBreakDto) {
    await this.assertApprovedDriver(driver);
    await this.dataSource.transaction(async (manager) => {
      const shift = await this.lockActiveShift(manager, driver.userId);
      if (!shift) {
        throw this.notOnline();
      }
      await this.assertNoActiveOrder(manager, driver.userId);
      const breakUntil = new Date(Date.now() + input.minutes * 60 * 1000);
      shift.status = DriverWorkStatus.Break;
      shift.breakUntil = breakUntil;
      await manager.getRepository(DriverShiftEntity).save(shift);
      await this.recordWorkEvent(
        manager,
        driver,
        shift,
        'driver.break_started',
        { minutes: input.minutes, breakUntil: breakUntil.toISOString() },
      );
    });
    return this.getState(driver);
  }

  async resume(driver: AuthenticatedUser) {
    await this.assertApprovedDriver(driver);
    await this.dataSource.transaction(async (manager) => {
      const shift = await this.lockActiveShift(manager, driver.userId);
      if (!shift) {
        throw this.notOnline();
      }
      if (shift.status === DriverWorkStatus.Online) {
        return;
      }
      shift.status = DriverWorkStatus.Online;
      shift.breakUntil = null;
      await manager.getRepository(DriverShiftEntity).save(shift);
      await this.recordWorkEvent(manager, driver, shift, 'driver.break_ended');
    });
    return this.getState(driver);
  }

  async updateSettings(
    driver: AuthenticatedUser,
    input: UpdateDriverWorkSettingsDto,
  ) {
    await this.assertApprovedDriver(driver);
    const settings = await this.getOrCreateSettings(driver.userId);
    const acceptsTaxi = input.acceptsTaxi ?? settings.acceptsTaxi;
    const acceptsDelivery = input.acceptsDelivery ?? settings.acceptsDelivery;
    if (!acceptsTaxi && !acceptsDelivery) {
      throw new ConflictException({
        code: 'DRIVER_ORDER_KIND_REQUIRED',
        message: 'At least one order kind must be enabled',
      });
    }

    settings.acceptsTaxi = acceptsTaxi;
    settings.acceptsDelivery = acceptsDelivery;
    settings.backgroundNotifications =
      input.backgroundNotifications ?? settings.backgroundNotifications;
    settings.nightNotifications =
      input.nightNotifications ?? settings.nightNotifications;
    const saved = await this.settings.save(settings);
    await this.activityEvents.record({
      eventType: 'driver_work_settings_updated',
      actorUserId: driver.userId,
      entityType: 'driver_work_settings',
      entityId: driver.userId,
      metadata: this.settingsResponse(saved),
    });
    return this.getState(driver);
  }

  async assertCanViewBoard(
    driver: AuthenticatedUser,
  ): Promise<DriverBoardAccess> {
    await this.assertCanAcceptOrders(driver);
    const shift = await this.getNormalizedActiveShift(driver.userId);
    if (!shift) {
      throw this.notOnline();
    }
    if (shift.status === DriverWorkStatus.Break) {
      throw new ConflictException({
        code: 'DRIVER_ON_BREAK',
        message: 'Driver is on a break',
      });
    }
    const settings = await this.getOrCreateSettings(driver.userId);
    return {
      acceptedKinds: this.acceptedKinds(settings),
      visibilityDelaySeconds: await this.calculateVisibilityDelay(
        driver.userId,
      ),
    };
  }

  getVisibilityDelaySeconds(driverUserId: string): Promise<number> {
    return this.calculateVisibilityDelay(driverUserId);
  }

  async lockAvailableShiftForAccept(
    manager: EntityManager,
    driver: AuthenticatedUser,
  ): Promise<OrderKind[]> {
    const shift = await this.lockActiveShift(manager, driver.userId);
    if (!shift) {
      throw this.notOnline();
    }
    if (shift.status !== DriverWorkStatus.Online) {
      throw new ConflictException({
        code: 'DRIVER_ON_BREAK',
        message: 'Driver is on a break',
      });
    }
    const settings = await manager
      .getRepository(DriverWorkSettingsEntity)
      .findOneByOrFail({ driverUserId: driver.userId });
    return this.acceptedKinds(settings);
  }

  async assertCanAcceptOrders(driver: AuthenticatedUser): Promise<void> {
    await this.assertApprovedDriver(driver);
    await this.assertCommissionDebtWithinLimit(driver.userId);
  }

  async countAvailableDrivers(kind: OrderKind): Promise<number> {
    const acceptsColumn =
      kind === OrderKind.Taxi
        ? 'settings.accepts_taxi'
        : 'settings.accepts_delivery';
    const result = await this.dataSource.query<Array<{ count: string }>>(
      `
        SELECT COUNT(*)::text AS count
        FROM (
          SELECT shifts.driver_user_id
          FROM driver_shifts shifts
          INNER JOIN driver_profiles profiles
            ON profiles.user_id = shifts.driver_user_id
          INNER JOIN users
            ON users.id = shifts.driver_user_id
          LEFT JOIN driver_work_settings settings
            ON settings.driver_user_id = shifts.driver_user_id
          LEFT JOIN driver_commission_ledger_entries ledger
            ON ledger.driver_user_id = shifts.driver_user_id
          WHERE shifts.ended_at IS NULL
            AND shifts.status = 'online'
            AND profiles.verification_status = 'approved'
            AND users.status = 'active'
            AND COALESCE(${acceptsColumn}, true)
          GROUP BY shifts.driver_user_id
          HAVING COALESCE(SUM(ledger.amount), 0) < $1
        ) available_drivers
      `,
      [COMMISSION_DEBT_BLOCK_THRESHOLD],
    );
    return Number(result[0]?.count ?? 0);
  }

  async assertApprovedDriver(driver: AuthenticatedUser): Promise<void> {
    if (driver.role !== UserRole.Driver) {
      throw new ForbiddenException({
        code: 'DRIVER_ACCESS_REQUIRED',
        message: 'Driver access is required',
      });
    }
    const profile = await this.driverProfiles.findOneBy({
      userId: driver.userId,
      verificationStatus: DriverVerificationStatus.Approved,
    });
    if (!profile) {
      throw new ForbiddenException({
        code: 'APPROVED_DRIVER_REQUIRED',
        message: 'Approved driver access is required',
      });
    }
  }

  private async getNormalizedActiveShift(
    driverUserId: string,
  ): Promise<DriverShiftEntity | null> {
    const shift = await this.shifts.findOneBy({
      driverUserId,
      endedAt: IsNull(),
    });
    if (
      shift?.status === DriverWorkStatus.Break &&
      shift.breakUntil &&
      shift.breakUntil <= new Date()
    ) {
      shift.status = DriverWorkStatus.Online;
      shift.breakUntil = null;
      return this.shifts.save(shift);
    }
    return shift;
  }

  private async getOrCreateSettings(
    driverUserId: string,
  ): Promise<DriverWorkSettingsEntity> {
    const existing = await this.settings.findOneBy({ driverUserId });
    if (existing) {
      return existing;
    }
    try {
      return await this.settings.save(
        this.settings.create({
          driverUserId,
          acceptsTaxi: true,
          acceptsDelivery: true,
          backgroundNotifications: true,
          nightNotifications: false,
        }),
      );
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      return this.settings.findOneByOrFail({ driverUserId });
    }
  }

  private async getEarnings24h(driverUserId: string): Promise<number> {
    const result = await this.orders
      .createQueryBuilder('order')
      .select(
        'COALESCE(SUM(order.fareAmount - order.commissionAmount), 0)',
        'amount',
      )
      .where('order.driverUserId = :driverUserId', { driverUserId })
      .andWhere('order.status = :status', { status: OrderStatus.Completed })
      .andWhere('order.completedAt >= :from', {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .getRawOne<{ amount: string }>();
    return Number(result?.amount ?? 0);
  }

  private async calculateVisibilityDelay(
    driverUserId: string,
  ): Promise<number> {
    const activeDrivers = await this.dataSource.query<
      Array<{ driver_user_id: string }>
    >(
      `
        SELECT shifts.driver_user_id
        FROM driver_shifts shifts
        INNER JOIN driver_profiles profiles
          ON profiles.user_id = shifts.driver_user_id
        INNER JOIN users
          ON users.id = shifts.driver_user_id
        WHERE shifts.ended_at IS NULL
          AND shifts.status = 'online'
          AND profiles.verification_status = 'approved'
          AND users.status = 'active'
      `,
    );
    const driverIds = activeDrivers.map((item) => item.driver_user_id);
    if (driverIds.length < 2) {
      return 0;
    }

    const incomeRows = await this.dataSource.query<
      Array<{ driver_user_id: string; amount: string }>
    >(
      `
        SELECT
          driver_user_id,
          COALESCE(SUM(fare_amount - commission_amount), 0)::text AS amount
        FROM orders
        WHERE driver_user_id = ANY($1::uuid[])
          AND status = 'completed'
          AND completed_at >= $2
        GROUP BY driver_user_id
      `,
      [driverIds, new Date(Date.now() - 24 * 60 * 60 * 1000)],
    );
    const incomeByDriver = new Map(
      incomeRows.map((row) => [row.driver_user_id, Number(row.amount)]),
    );
    const total = driverIds.reduce(
      (sum, id) => sum + (incomeByDriver.get(id) ?? 0),
      0,
    );
    const average = total / driverIds.length;
    const current = incomeByDriver.get(driverUserId) ?? 0;
    return current > 0 && current >= average * HIGH_INCOME_RATIO
      ? BOARD_DELAY_SECONDS
      : 0;
  }

  private async assertNoActiveOrder(
    manager: EntityManager,
    driverUserId: string,
  ): Promise<void> {
    const activeOrder = await manager.getRepository(OrderEntity).findOneBy({
      driverUserId,
      status: In([...ACTIVE_DRIVER_ORDER_STATUSES]),
    });
    if (activeOrder) {
      throw new ConflictException({
        code: 'DRIVER_HAS_ACTIVE_ORDER',
        message: 'Finish or cancel the active order first',
      });
    }
  }

  private lockActiveShift(
    manager: EntityManager,
    driverUserId: string,
  ): Promise<DriverShiftEntity | null> {
    return manager
      .getRepository(DriverShiftEntity)
      .createQueryBuilder('shift')
      .setLock('pessimistic_write')
      .where('shift.driverUserId = :driverUserId', { driverUserId })
      .andWhere('shift.endedAt IS NULL')
      .getOne();
  }

  private async recordWorkEvent(
    manager: EntityManager,
    driver: AuthenticatedUser,
    shift: DriverShiftEntity,
    eventType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.activityEvents.record(
      {
        eventType: eventType.replaceAll('.', '_'),
        actorUserId: driver.userId,
        entityType: 'driver_shift',
        entityId: shift.id,
        metadata,
      },
      manager,
    );
    await this.outbox.enqueue(
      {
        aggregateType: 'driver_shift',
        aggregateId: shift.id,
        eventType,
        payload: {
          shiftId: shift.id,
          driverUserId: driver.userId,
          status: shift.endedAt ? 'offline' : shift.status,
          ...metadata,
        },
      },
      manager,
    );
  }

  private toState(
    shift: DriverShiftEntity | null,
    settings: DriverWorkSettingsEntity,
    earnings24h: number,
    commissionDebt: number,
    visibilityDelaySeconds: number,
  ) {
    return {
      status: shift?.status ?? 'offline',
      shiftId: shift?.id ?? null,
      startedAt: shift?.startedAt ?? null,
      breakUntil: shift?.breakUntil ?? null,
      earnings24h,
      commissionDebt,
      commissionDebtStatus: this.commissionDebtStatus(commissionDebt),
      visibilityDelaySeconds,
      settings: this.settingsResponse(settings),
    };
  }

  private settingsResponse(settings: DriverWorkSettingsEntity) {
    return {
      acceptsTaxi: settings.acceptsTaxi,
      acceptsDelivery: settings.acceptsDelivery,
      backgroundNotifications: settings.backgroundNotifications,
      nightNotifications: settings.nightNotifications,
    };
  }

  private async assertCommissionDebtWithinLimit(
    driverUserId: string,
  ): Promise<void> {
    const debt = await this.finance.getCommissionDebt(driverUserId);
    if (debt >= COMMISSION_DEBT_BLOCK_THRESHOLD) {
      throw new ConflictException({
        code: 'COMMISSION_DEBT_LIMIT_REACHED',
        message:
          'Commission debt reached 5000 RUB. Contact the service to confirm repayment.',
      });
    }
  }

  private commissionDebtStatus(
    debt: number,
  ): 'clear' | 'info' | 'reminder' | 'blocked' {
    if (debt >= COMMISSION_DEBT_BLOCK_THRESHOLD) {
      return 'blocked';
    }
    if (debt >= COMMISSION_DEBT_REMINDER_THRESHOLD) {
      return 'reminder';
    }
    if (debt >= COMMISSION_DEBT_NOTICE_THRESHOLD) {
      return 'info';
    }
    return debt > 0 ? 'info' : 'clear';
  }

  private acceptedKinds(settings: DriverWorkSettingsEntity): OrderKind[] {
    const result: OrderKind[] = [];
    if (settings.acceptsTaxi) {
      result.push(OrderKind.Taxi);
    }
    if (settings.acceptsDelivery) {
      result.push(OrderKind.Delivery);
    }
    return result;
  }

  private notOnline(): ConflictException {
    return new ConflictException({
      code: 'DRIVER_NOT_ONLINE',
      message: 'Start a shift before opening the order board',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    return (error.driverError as { code?: unknown }).code === '23505';
  }
}
