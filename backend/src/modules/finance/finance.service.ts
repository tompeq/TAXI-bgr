import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrderEntity } from '../orders/order.entity';
import { OrderPaymentMethod } from '../orders/order-payment-method.enum';
import { OrderStatus } from '../orders/order-status.enum';
import { ServiceSettingsEntity } from '../service-settings/service-settings.entity';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { UserRole } from '../users/user-role.enum';
import { AdjustCommissionDebtDto } from './dto/adjust-commission-debt.dto';
import { RecordCommissionSettlementDto } from './dto/record-commission-settlement.dto';
import { UpdateDriverCommissionDto } from './dto/update-driver-commission.dto';
import { UpdateDriverPaymentDetailsDto } from './dto/update-driver-payment-details.dto';
import { DriverCommissionLedgerEntryEntity } from './driver-commission-ledger-entry.entity';
import { CommissionLedgerEntryType } from './commission-ledger-entry-type.enum';

const VLADIVOSTOK = 'Asia/Vladivostok';

@Injectable()
export class FinanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventsService,
    @InjectRepository(DriverCommissionLedgerEntryEntity)
    private readonly ledger: Repository<DriverCommissionLedgerEntryEntity>,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfiles: Repository<DriverProfileEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(ServiceSettingsEntity)
    private readonly serviceSettings: Repository<ServiceSettingsEntity>,
  ) {}

  async getDriverPaymentDetails(driver: AuthenticatedUser) {
    this.assertDriver(driver);
    const profile = await this.findDriverProfileByUserId(driver.userId);
    return this.toPaymentDetails(profile);
  }

  async updateDriverPaymentDetails(
    driver: AuthenticatedUser,
    input: UpdateDriverPaymentDetailsDto,
  ) {
    this.assertDriver(driver);
    const profile = await this.findDriverProfileByUserId(driver.userId);
    profile.transferPhone = this.normalizeRussianPhone(input.transferPhone);
    profile.transferBank = input.transferBank.trim();
    const saved = await this.driverProfiles.save(profile);
    await this.activityEvents.record({
      eventType: 'driver_payment_details_updated',
      actorUserId: driver.userId,
      entityType: 'driver_profile',
      entityId: saved.id,
    });
    return this.toPaymentDetails(saved);
  }

  async getTransferDetailsForPassenger(
    orderId: string,
    passenger: AuthenticatedUser,
  ) {
    this.assertPassenger(passenger);
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { driver: true },
    });
    if (!order || order.passengerUserId !== passenger.userId) {
      throw this.orderNotFound();
    }
    if (order.paymentMethod !== OrderPaymentMethod.Transfer) {
      throw new ConflictException({
        code: 'ORDER_PAYMENT_METHOD_NOT_TRANSFER',
        message: 'Transfer details are only available for transfer orders',
      });
    }
    if (order.status === OrderStatus.Canceled) {
      throw new ConflictException({
        code: 'TRANSFER_DETAILS_NOT_AVAILABLE',
        message: 'Transfer details are not available for a canceled order',
      });
    }
    if (!order.driverUserId || !order.driver) {
      throw new ConflictException({
        code: 'TRANSFER_DETAILS_NOT_READY',
        message: 'A driver has not accepted the order yet',
      });
    }
    const profile = await this.findDriverProfileByUserId(order.driverUserId);
    if (!profile.transferPhone || !profile.transferBank) {
      throw new ConflictException({
        code: 'TRANSFER_DETAILS_NOT_READY',
        message: 'The driver has not added transfer details yet',
      });
    }
    return {
      driverName: order.driver.name,
      transferPhone: profile.transferPhone,
      transferBank: profile.transferBank,
    };
  }

  async accrueCommissionForCompletedOrder(
    manager: EntityManager,
    order: OrderEntity,
  ): Promise<void> {
    if (!order.driverUserId) {
      throw new ConflictException({
        code: 'COMMISSION_DRIVER_REQUIRED',
        message: 'A completed order must have a driver',
      });
    }
    const ledger = manager.getRepository(DriverCommissionLedgerEntryEntity);
    const existing = await ledger.findOneBy({ orderId: order.id });
    if (existing) {
      return;
    }
    const profile = await manager
      .getRepository(DriverProfileEntity)
      .createQueryBuilder('profile')
      .setLock('pessimistic_write')
      .where('profile.userId = :driverUserId', {
        driverUserId: order.driverUserId,
      })
      .getOne();
    if (!profile) {
      throw new ConflictException({
        code: 'DRIVER_PROFILE_NOT_FOUND',
        message: 'The assigned driver profile was not found',
      });
    }
    const settings = await manager
      .getRepository(ServiceSettingsEntity)
      .findOneByOrFail({ id: 1 });

    const rate =
      profile.commissionPercentOverride ?? settings.commissionPercent;
    const amount = Math.round((order.fareAmount * rate) / 100);
    order.commissionRatePercent = rate;
    order.commissionAmount = amount;
    await ledger.save(
      ledger.create({
        driverUserId: order.driverUserId,
        orderId: order.id,
        type: CommissionLedgerEntryType.OrderAccrual,
        amount,
        note: `Commission for order ${order.id}`,
        createdByUserId: null,
      }),
    );
    await this.activityEvents.record(
      {
        eventType: 'driver_commission_accrued',
        actorUserId: order.driverUserId,
        entityType: 'order',
        entityId: order.id,
        metadata: { rate, amount },
      },
      manager,
    );
  }

  async getCommissionDebt(driverUserId: string): Promise<number> {
    return this.getCommissionDebtFromRepository(this.ledger, driverUserId);
  }

  private async getCommissionDebtFromRepository(
    ledger: Repository<DriverCommissionLedgerEntryEntity>,
    driverUserId: string,
  ): Promise<number> {
    const result = await ledger
      .createQueryBuilder('entry')
      .select('COALESCE(SUM(entry.amount), 0)', 'amount')
      .where('entry.driverUserId = :driverUserId', { driverUserId })
      .getRawOne<{ amount: string }>();
    return Number(result?.amount ?? 0);
  }

  async listAdminDriverFinances() {
    const [settings, profiles, debtRows, earningsRows] = await Promise.all([
      this.serviceSettings.findOneByOrFail({ id: 1 }),
      this.driverProfiles.find({
        relations: { user: true },
        order: { fullName: 'ASC' },
      }),
      this.ledger
        .createQueryBuilder('entry')
        .select('entry.driverUserId', 'driverUserId')
        .addSelect('COALESCE(SUM(entry.amount), 0)', 'commissionDebt')
        .groupBy('entry.driverUserId')
        .getRawMany<{ driverUserId: string; commissionDebt: string }>(),
      this.driverEarningsQuery().getRawMany<DriverEarningsRow>(),
    ]);
    const debts = new Map(
      debtRows.map((row) => [row.driverUserId, Number(row.commissionDebt)]),
    );
    const earnings = new Map(
      earningsRows.map((row) => [row.driverUserId, row]),
    );
    return {
      items: profiles.map((profile) =>
        this.toAdminDriverFinance(
          profile,
          settings.commissionPercent,
          debts.get(profile.userId) ?? 0,
          earnings.get(profile.userId),
        ),
      ),
    };
  }

  async getAdminDriverFinance(profileId: string) {
    const [settings, profile] = await Promise.all([
      this.serviceSettings.findOneByOrFail({ id: 1 }),
      this.driverProfiles.findOne({
        where: { id: profileId },
        relations: { user: true },
      }),
    ]);
    if (!profile) {
      throw this.driverNotFound();
    }
    const [debt, row] = await Promise.all([
      this.getCommissionDebt(profile.userId),
      this.driverEarningsQuery(profile.userId).getRawOne<DriverEarningsRow>(),
    ]);
    return this.toAdminDriverFinance(
      profile,
      settings.commissionPercent,
      debt,
      row,
    );
  }

  async updateDriverCommission(
    profileId: string,
    input: UpdateDriverCommissionDto,
    admin: AuthenticatedUser,
  ) {
    const profile = await this.driverProfiles.findOneBy({ id: profileId });
    if (!profile) {
      throw this.driverNotFound();
    }
    if (Object.hasOwn(input, 'commissionPercentOverride')) {
      profile.commissionPercentOverride =
        input.commissionPercentOverride ?? null;
      await this.driverProfiles.save(profile);
      await this.activityEvents.record({
        eventType: 'driver_commission_rate_updated',
        actorUserId: admin.userId,
        entityType: 'driver_profile',
        entityId: profile.id,
        metadata: {
          commissionPercentOverride: profile.commissionPercentOverride,
        },
      });
    }
    return this.getAdminDriverFinance(profileId);
  }

  async adjustCommissionDebt(
    profileId: string,
    input: AdjustCommissionDebtDto,
    admin: AuthenticatedUser,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const profiles = manager.getRepository(DriverProfileEntity);
      const profile = await profiles
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.id = :profileId', { profileId })
        .getOne();
      if (!profile) {
        throw this.driverNotFound();
      }
      const ledger = manager.getRepository(DriverCommissionLedgerEntryEntity);
      const currentDebt = await this.getCommissionDebtFromRepository(
        ledger,
        profile.userId,
      );
      const difference = input.targetDebt - currentDebt;
      if (difference === 0) {
        return;
      }
      await ledger.save(
        ledger.create({
          driverUserId: profile.userId,
          orderId: null,
          type: CommissionLedgerEntryType.ManualAdjustment,
          amount: difference,
          note: input.note?.trim() || 'Manual commission debt adjustment',
          createdByUserId: admin.userId,
        }),
      );
      await this.activityEvents.record(
        {
          eventType: 'driver_commission_debt_adjusted',
          actorUserId: admin.userId,
          entityType: 'driver_profile',
          entityId: profile.id,
          metadata: {
            previousDebt: currentDebt,
            targetDebt: input.targetDebt,
          },
        },
        manager,
      );
    });
    return this.getAdminDriverFinance(profileId);
  }

  async recordCommissionSettlement(
    profileId: string,
    input: RecordCommissionSettlementDto,
    admin: AuthenticatedUser,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const profiles = manager.getRepository(DriverProfileEntity);
      const profile = await profiles
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.id = :profileId', { profileId })
        .getOne();
      if (!profile) {
        throw this.driverNotFound();
      }
      const ledger = manager.getRepository(DriverCommissionLedgerEntryEntity);
      const currentDebt = await this.getCommissionDebtFromRepository(
        ledger,
        profile.userId,
      );
      if (input.amount > currentDebt) {
        throw new ConflictException({
          code: 'COMMISSION_SETTLEMENT_EXCEEDS_DEBT',
          message: 'Settlement amount cannot exceed current commission debt',
        });
      }
      await ledger.save(
        ledger.create({
          driverUserId: profile.userId,
          orderId: null,
          type: CommissionLedgerEntryType.Settlement,
          amount: -input.amount,
          note: input.note?.trim() || 'Commission transfer confirmed by admin',
          createdByUserId: admin.userId,
        }),
      );
      await this.activityEvents.record(
        {
          eventType: 'driver_commission_settlement_recorded',
          actorUserId: admin.userId,
          entityType: 'driver_profile',
          entityId: profile.id,
          metadata: { amount: input.amount },
        },
        manager,
      );
    });
    return this.getAdminDriverFinance(profileId);
  }

  async getFinanceTotals() {
    const [debt, earningsRows] = await Promise.all([
      this.ledger
        .createQueryBuilder('entry')
        .select('COALESCE(SUM(entry.amount), 0)', 'amount')
        .getRawOne<{ amount: string }>(),
      this.driverEarningsQuery().getRawMany<DriverEarningsRow>(),
    ]);
    return {
      commissionDebt: Number(debt?.amount ?? 0),
      driverEarningsToday: earningsRows.reduce(
        (total, row) => total + Number(row.day ?? 0),
        0,
      ),
    };
  }

  private driverEarningsQuery(driverUserId?: string) {
    const localNow = `(NOW() AT TIME ZONE '${VLADIVOSTOK}')`;
    const periodStart = (period: 'day' | 'week' | 'month' | 'year') =>
      `(date_trunc('${period}', ${localNow}) AT TIME ZONE '${VLADIVOSTOK}')`;
    const builder = this.orders
      .createQueryBuilder('ride')
      .select('ride.driver_user_id', 'driverUserId')
      .addSelect(
        `COALESCE(SUM(CASE WHEN ride.completed_at >= ${periodStart('day')} THEN ride.fare_amount - ride.commission_amount ELSE 0 END), 0)`,
        'day',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ride.completed_at >= ${periodStart('week')} THEN ride.fare_amount - ride.commission_amount ELSE 0 END), 0)`,
        'week',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ride.completed_at >= ${periodStart('month')} THEN ride.fare_amount - ride.commission_amount ELSE 0 END), 0)`,
        'month',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN ride.completed_at >= ${periodStart('year')} THEN ride.fare_amount - ride.commission_amount ELSE 0 END), 0)`,
        'year',
      )
      .where('ride.status = :status', { status: OrderStatus.Completed });
    if (driverUserId) {
      builder.andWhere('ride.driver_user_id = :driverUserId', { driverUserId });
    }
    return builder.groupBy('ride.driver_user_id');
  }

  private toAdminDriverFinance(
    profile: DriverProfileEntity,
    defaultCommissionPercent: number,
    commissionDebt: number,
    earnings?: DriverEarningsRow,
  ) {
    const effectiveCommissionPercent =
      profile.commissionPercentOverride ?? defaultCommissionPercent;
    return {
      profileId: profile.id,
      driverUserId: profile.userId,
      fullName: profile.fullName,
      phone: profile.user.phone,
      commissionPercentOverride: profile.commissionPercentOverride,
      effectiveCommissionPercent,
      commissionDebt,
      earnings: {
        day: Number(earnings?.day ?? 0),
        week: Number(earnings?.week ?? 0),
        month: Number(earnings?.month ?? 0),
        year: Number(earnings?.year ?? 0),
      },
    };
  }

  private toPaymentDetails(profile: DriverProfileEntity) {
    return {
      transferPhone: profile.transferPhone,
      transferBank: profile.transferBank,
      configured: Boolean(profile.transferPhone && profile.transferBank),
    };
  }

  private async findDriverProfileByUserId(userId: string) {
    const profile = await this.driverProfiles.findOneBy({ userId });
    if (!profile) {
      throw this.driverNotFound();
    }
    return profile;
  }

  private normalizeRussianPhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return `+7${digits.slice(1)}`;
  }

  private assertDriver(user: AuthenticatedUser): void {
    if (user.role !== UserRole.Driver) {
      throw new ForbiddenException({
        code: 'DRIVER_FINANCE_ROLE_FORBIDDEN',
        message: 'Only a driver can manage payment details',
      });
    }
  }

  private assertPassenger(user: AuthenticatedUser): void {
    if (user.role !== UserRole.Passenger) {
      throw new ForbiddenException({
        code: 'ORDER_ROLE_FORBIDDEN',
        message: 'Only the passenger can view transfer details',
      });
    }
  }

  private driverNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'DRIVER_PROFILE_NOT_FOUND',
      message: 'Driver profile was not found',
    });
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Order was not found',
    });
  }
}

interface DriverEarningsRow {
  driverUserId: string;
  day: string;
  week: string;
  month: string;
  year: string;
}
