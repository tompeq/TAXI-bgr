import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import { ActivityEventEntity } from '../activity-events/activity-event.entity';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdjustCommissionDebtDto } from '../finance/dto/adjust-commission-debt.dto';
import { RecordCommissionSettlementDto } from '../finance/dto/record-commission-settlement.dto';
import { UpdateDriverCommissionDto } from '../finance/dto/update-driver-commission.dto';
import { FinanceService } from '../finance/finance.service';
import { OutboxService } from '../outbox/outbox.service';
import { OrderEntity } from '../orders/order.entity';
import { OrderKind } from '../orders/order-kind.enum';
import { OrderStatus } from '../orders/order-status.enum';
import { ServiceZoneCode } from '../orders/service-zone-code.enum';
import { TariffSettingEntity } from '../orders/tariff-setting.entity';
import { StorageService } from '../storage/storage.service';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { UserStatus } from '../users/user-status.enum';
import { UserEntity } from '../users/user.entity';
import { ListDriverApplicationsDto } from './dto/list-driver-applications.dto';
import { DriverReviewDecision, ReviewDriverDto } from './dto/review-driver.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import { DriverVerificationReviewEntity } from './driver-verification-review.entity';
import { ServiceSettingsEntity } from '../service-settings/service-settings.entity';
import { UpdateServiceSettingsDto } from '../service-settings/dto/update-service-settings.dto';
import {
  RoadConditionArea,
  RoadConditionStateEntity,
} from '../surveys/road-condition-state.entity';
import { UpdateRoadConditionDto } from './dto/update-road-condition.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly activityEvents: ActivityEventsService,
    private readonly outbox: OutboxService,
    private readonly finance: FinanceService,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfiles: Repository<DriverProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(DriverVerificationReviewEntity)
    private readonly reviews: Repository<DriverVerificationReviewEntity>,
    @InjectRepository(TariffSettingEntity)
    private readonly tariffSettings: Repository<TariffSettingEntity>,
    @InjectRepository(ServiceSettingsEntity)
    private readonly serviceSettings: Repository<ServiceSettingsEntity>,
    @InjectRepository(RoadConditionStateEntity)
    private readonly roadConditions: Repository<RoadConditionStateEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(ActivityEventEntity)
    private readonly activityEventRecords: Repository<ActivityEventEntity>,
  ) {}

  async getDashboard() {
    const [
      pendingDrivers,
      approvedDrivers,
      blockedDrivers,
      registeredUsers,
      createdOrders,
      completedOrders,
      activity,
      finance,
    ] = await Promise.all([
      this.driverProfiles.countBy({
        verificationStatus: DriverVerificationStatus.Pending,
      }),
      this.driverProfiles.countBy({
        verificationStatus: DriverVerificationStatus.Approved,
      }),
      this.driverProfiles.countBy({
        verificationStatus: DriverVerificationStatus.Blocked,
      }),
      this.users.count(),
      this.orders.count(),
      this.orders.countBy({ status: OrderStatus.Completed }),
      this.getActivityStats(),
      this.finance.getFinanceTotals(),
    ]);

    return {
      pendingDrivers,
      approvedDrivers,
      blockedDrivers,
      registeredUsers,
      orders: {
        created: createdOrders,
        completed: completedOrders,
        notCompleted: createdOrders - completedOrders,
      },
      activity,
      finance,
    };
  }

  listDriverFinances() {
    return this.finance.listAdminDriverFinances();
  }

  async listTariffs() {
    const settings = await this.tariffSettings.find({
      order: { kind: 'ASC', zone: 'ASC' },
    });
    return { items: settings.map((setting) => this.toTariff(setting)) };
  }

  async getServiceSettings() {
    const settings = await this.serviceSettings.findOneByOrFail({ id: 1 });
    return this.toServiceSettings(settings);
  }

  async updateServiceSettings(
    input: UpdateServiceSettingsDto,
    admin: AuthenticatedUser,
  ) {
    let savedId = 1;
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ServiceSettingsEntity);
      const settings = await repository
        .createQueryBuilder('settings')
        .setLock('pessimistic_write')
        .where('settings.id = 1')
        .getOneOrFail();
      const previous = this.toServiceSettings(settings);

      Object.assign(settings, input);
      settings.priceSurveyQuestion = settings.priceSurveyQuestion.trim();
      settings.roadSurveyBgrQuestion = settings.roadSurveyBgrQuestion.trim();
      settings.roadSurveyHarborQuestion =
        settings.roadSurveyHarborQuestion.trim();
      settings.driverBoardAnnouncement =
        settings.driverBoardAnnouncement.trim();
      settings.updatedByUserId = admin.userId;
      const saved = await repository.save(settings);
      savedId = saved.id;
      const next = this.toServiceSettings(saved);

      await this.activityEvents.record(
        {
          eventType: 'service_settings_updated',
          actorUserId: admin.userId,
          entityType: 'service_settings',
          entityId: admin.userId,
          metadata: { previous, next },
        },
        manager,
      );
      await this.outbox.enqueue(
        {
          aggregateType: 'service_settings',
          aggregateId: admin.userId,
          eventType: 'service.settings_updated',
          payload: { settingsId: saved.id, version: saved.version },
        },
        manager,
      );
    });
    const saved = await this.serviceSettings.findOneByOrFail({ id: savedId });
    return this.toServiceSettings(saved);
  }

  async getRoadConditions() {
    const items = await this.roadConditions.find({ order: { area: 'ASC' } });
    return { items: items.map((item) => this.toRoadCondition(item)) };
  }

  async updateRoadCondition(
    area: RoadConditionArea,
    input: UpdateRoadConditionDto,
    admin: AuthenticatedUser,
  ) {
    const state = await this.roadConditions.findOneByOrFail({ area });
    const previous = this.toRoadCondition(state);
    state.surchargeActive = input.surchargeActive;
    state.badVotes = 0;
    state.goodVotes = 0;
    state.stateChangedAt = new Date();
    const saved = await this.roadConditions.save(state);
    await this.activityEvents.record({
      eventType: 'road_condition_overridden',
      actorUserId: admin.userId,
      entityType: 'road_condition_state',
      entityId: admin.userId,
      metadata: { area, previous, next: this.toRoadCondition(saved) },
    });
    return this.toRoadCondition(saved);
  }

  async updateTariff(
    kind: OrderKind,
    zone: ServiceZoneCode,
    input: UpdateTariffDto,
    admin: AuthenticatedUser,
  ) {
    let settingId = '';
    await this.dataSource.transaction(async (manager) => {
      const settings = manager.getRepository(TariffSettingEntity);
      const setting = await settings
        .createQueryBuilder('setting')
        .setLock('pessimistic_write')
        .where('setting.kind = :kind', { kind })
        .andWhere('setting.zone = :zone', { zone })
        .getOne();
      if (!setting) {
        throw new NotFoundException({
          code: 'TARIFF_NOT_FOUND',
          message: 'Tariff was not found',
        });
      }

      const previous = {
        dayFare: setting.dayFare,
        eveningFare: setting.eveningFare,
        nightFare: setting.nightFare,
      };
      setting.dayFare = input.dayFare;
      setting.eveningFare = input.eveningFare;
      setting.nightFare = input.nightFare;
      setting.updatedByUserId = admin.userId;
      const saved = await settings.save(setting);
      settingId = saved.id;

      const next = {
        dayFare: saved.dayFare,
        eveningFare: saved.eveningFare,
        nightFare: saved.nightFare,
      };
      await this.activityEvents.record(
        {
          eventType: 'tariff_updated',
          actorUserId: admin.userId,
          entityType: 'tariff_setting',
          entityId: saved.id,
          metadata: { kind, zone, previous, next, version: saved.version },
        },
        manager,
      );
      await this.outbox.enqueue(
        {
          aggregateType: 'tariff_setting',
          aggregateId: saved.id,
          eventType: 'tariff.updated',
          payload: {
            tariffSettingId: saved.id,
            kind,
            zone,
            previous,
            next,
            version: saved.version,
          },
        },
        manager,
      );
    });

    const setting = await this.tariffSettings.findOneByOrFail({
      id: settingId,
    });
    return this.toTariff(setting);
  }

  async listDriverApplications(query: ListDriverApplicationsDto) {
    const builder = this.driverProfiles
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'user')
      .orderBy('profile.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    if (query.status) {
      builder.andWhere('profile.verificationStatus = :status', {
        status: query.status,
      });
    }
    const search = query.search?.trim();
    if (search) {
      builder.andWhere(
        `(
          profile.fullName ILIKE :search
          OR user.phone ILIKE :search
          OR profile.vehicleMakeModel ILIKE :search
          OR profile.vehicleColor ILIKE :search
          OR profile.vehiclePlate ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    const [profiles, total] = await builder.getManyAndCount();
    return {
      items: profiles.map((profile) => this.toDriverSummary(profile)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getDriverApplication(profileId: string) {
    const profile = await this.driverProfiles.findOne({
      where: { id: profileId },
      relations: { user: true },
    });
    if (!profile) {
      throw this.driverNotFound();
    }

    const history = await this.reviews.find({
      where: { driverProfileId: profile.id },
      relations: { reviewer: true },
      order: { createdAt: 'DESC' },
    });
    const [licensePhotoUrl, licensePhotoBackUrl, carPhotoUrls, finance] =
      await Promise.all([
        this.storage.getTemporaryDownloadUrl(profile.licensePhotoKey),
        profile.licensePhotoBackKey
          ? this.storage.getTemporaryDownloadUrl(profile.licensePhotoBackKey)
          : Promise.resolve(null),
        Promise.all(
          profile.carPhotoKeys.map((key) =>
            this.storage.getTemporaryDownloadUrl(key),
          ),
        ),
        this.finance.getAdminDriverFinance(profile.id),
      ]);

    return {
      ...this.toDriverSummary(profile),
      licensePhotoUrl,
      licensePhotoBackUrl,
      carPhotoUrls,
      reviewComment: profile.reviewComment,
      reviewedAt: profile.reviewedAt,
      finance,
      history: history.map((review) => ({
        id: review.id,
        previousStatus: review.previousStatus,
        decisionStatus: review.decisionStatus,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: {
          id: review.reviewer.id,
          name: review.reviewer.name,
        },
      })),
    };
  }

  async reviewDriver(
    profileId: string,
    input: ReviewDriverDto,
    admin: AuthenticatedUser,
  ) {
    const comment = input.comment?.trim() || null;
    if (input.decision !== DriverReviewDecision.Approve && !comment) {
      throw new BadRequestException({
        code: 'REVIEW_COMMENT_REQUIRED',
        message: 'A comment is required for this decision',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const profiles = manager.getRepository(DriverProfileEntity);
      const profile = await profiles
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('profile.user', 'user')
        .where('profile.id = :profileId', { profileId })
        .getOne();
      if (!profile) {
        throw this.driverNotFound();
      }

      const previousStatus = profile.verificationStatus;
      const next = this.resolveDecision(input.decision);
      profile.verificationStatus = next.verificationStatus;
      profile.user.status = next.userStatus;
      profile.reviewedByUserId = admin.userId;
      profile.reviewedAt = new Date();
      profile.reviewComment = comment;
      profile.blockedReason =
        input.decision === DriverReviewDecision.Block ? comment : null;

      await manager.getRepository(UserEntity).save(profile.user);
      await profiles.save(profile);
      await manager.getRepository(DriverVerificationReviewEntity).save({
        driverProfileId: profile.id,
        reviewerUserId: admin.userId,
        previousStatus,
        decisionStatus: next.verificationStatus,
        comment,
      });
      await this.recordReview(
        manager,
        profile,
        admin,
        previousStatus,
        next.verificationStatus,
      );
    });

    return this.getDriverApplication(profileId);
  }

  async updateDriverCommission(
    profileId: string,
    input: UpdateDriverCommissionDto,
    admin: AuthenticatedUser,
  ) {
    await this.finance.updateDriverCommission(profileId, input, admin);
    return this.getDriverApplication(profileId);
  }

  async adjustDriverCommissionDebt(
    profileId: string,
    input: AdjustCommissionDebtDto,
    admin: AuthenticatedUser,
  ) {
    await this.finance.adjustCommissionDebt(profileId, input, admin);
    return this.getDriverApplication(profileId);
  }

  async recordDriverCommissionSettlement(
    profileId: string,
    input: RecordCommissionSettlementDto,
    admin: AuthenticatedUser,
  ) {
    await this.finance.recordCommissionSettlement(profileId, input, admin);
    return this.getDriverApplication(profileId);
  }

  private resolveDecision(decision: DriverReviewDecision): {
    verificationStatus: DriverVerificationStatus;
    userStatus: UserStatus;
  } {
    switch (decision) {
      case DriverReviewDecision.Approve:
        return {
          verificationStatus: DriverVerificationStatus.Approved,
          userStatus: UserStatus.Active,
        };
      case DriverReviewDecision.Reject:
        return {
          verificationStatus: DriverVerificationStatus.Rejected,
          userStatus: UserStatus.PendingVerification,
        };
      case DriverReviewDecision.RequestChanges:
        return {
          verificationStatus: DriverVerificationStatus.ChangesRequested,
          userStatus: UserStatus.PendingVerification,
        };
      case DriverReviewDecision.Block:
        return {
          verificationStatus: DriverVerificationStatus.Blocked,
          userStatus: UserStatus.Blocked,
        };
    }
  }

  private async recordReview(
    manager: EntityManager,
    profile: DriverProfileEntity,
    admin: AuthenticatedUser,
    previousStatus: DriverVerificationStatus,
    decisionStatus: DriverVerificationStatus,
  ): Promise<void> {
    const metadata = { previousStatus, decisionStatus };
    await this.activityEvents.record(
      {
        eventType: 'driver_verification_reviewed',
        actorUserId: admin.userId,
        entityType: 'driver_profile',
        entityId: profile.id,
        metadata,
      },
      manager,
    );
    await this.outbox.enqueue(
      {
        aggregateType: 'driver_profile',
        aggregateId: profile.id,
        eventType: 'driver.verification_reviewed',
        payload: {
          driverProfileId: profile.id,
          driverUserId: profile.userId,
          ...metadata,
        },
      },
      manager,
    );
  }

  private toDriverSummary(profile: DriverProfileEntity) {
    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      phone: profile.user.phone,
      vehicleMakeModel: profile.vehicleMakeModel,
      vehicleColor: profile.vehicleColor,
      vehiclePlate: profile.vehiclePlate,
      verificationStatus: profile.verificationStatus,
      userStatus: profile.user.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private toTariff(setting: TariffSettingEntity) {
    return {
      id: setting.id,
      kind: setting.kind,
      zone: setting.zone,
      dayFare: setting.dayFare,
      eveningFare: setting.eveningFare,
      nightFare: setting.nightFare,
      version: setting.version,
      updatedAt: setting.updatedAt,
    };
  }

  private toServiceSettings(settings: ServiceSettingsEntity) {
    return {
      acceptedOrderTimeoutSeconds: settings.acceptedOrderTimeoutSeconds,
      freeWaitingMinutes: settings.freeWaitingMinutes,
      waitingPricePerMinute: settings.waitingPricePerMinute,
      arrivalSoonMinutes: settings.arrivalSoonMinutes,
      driverBoardAnnouncement: settings.driverBoardAnnouncement,
      commissionPercent: settings.commissionPercent,
      priceSurveyEnabled: settings.priceSurveyEnabled,
      priceSurveyIntervalDays: settings.priceSurveyIntervalDays,
      priceSurveyQuestion: settings.priceSurveyQuestion,
      priceSurveyAllowSuggestion: settings.priceSurveyAllowSuggestion,
      roadSurveyEnabled: settings.roadSurveyEnabled,
      roadSurveyIntervalDays: settings.roadSurveyIntervalDays,
      roadSurveyBgrQuestion: settings.roadSurveyBgrQuestion,
      roadSurveyHarborQuestion: settings.roadSurveyHarborQuestion,
      harborSurveyAfterEachTrip: settings.harborSurveyAfterEachTrip,
      roadBadVotesRequired: settings.roadBadVotesRequired,
      roadGoodVotesToDisable: settings.roadGoodVotesToDisable,
      roadSurchargePercent: settings.roadSurchargePercent,
      version: settings.version,
      updatedAt: settings.updatedAt,
    };
  }

  private toRoadCondition(state: RoadConditionStateEntity) {
    return {
      area: state.area,
      surchargeActive: state.surchargeActive,
      badVotes: state.badVotes,
      goodVotes: state.goodVotes,
      stateChangedAt: state.stateChangedAt,
      updatedAt: state.updatedAt,
    };
  }

  private driverNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'DRIVER_APPLICATION_NOT_FOUND',
      message: 'Driver application was not found',
    });
  }

  private async getActivityStats() {
    const localDayStart =
      "(date_trunc('day', NOW() AT TIME ZONE 'Asia/Vladivostok') AT TIME ZONE 'Asia/Vladivostok')";
    const stats = await this.activityEventRecords
      .createQueryBuilder('event')
      .select(
        "COUNT(*) FILTER (WHERE event.event_type = 'login_succeeded')",
        'loginsTotal',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE event.event_type = 'logout')",
        'logoutsTotal',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE event.event_type = 'login_succeeded'
            AND event.occurred_at >= ${localDayStart}
        )`,
        'loginsToday',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE event.event_type = 'logout'
            AND event.occurred_at >= ${localDayStart}
        )`,
        'logoutsToday',
      )
      .getRawOne<{
        loginsTotal: string;
        logoutsTotal: string;
        loginsToday: string;
        logoutsToday: string;
      }>();
    return {
      loginsTotal: Number(stats?.loginsTotal ?? 0),
      logoutsTotal: Number(stats?.logoutsTotal ?? 0),
      loginsToday: Number(stats?.loginsToday ?? 0),
      logoutsToday: Number(stats?.logoutsToday ?? 0),
    };
  }
}
