import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DriverWorkService } from '../driver-work/driver-work.service';
import { OrderEntity } from '../orders/order.entity';
import { OrderStatus } from '../orders/order-status.enum';
import { ServiceZoneCode } from '../orders/service-zone-code.enum';
import { ServiceSettingsService } from '../service-settings/service-settings.service';
import { ServiceSettingsEntity } from '../service-settings/service-settings.entity';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { DriverSurveyResponseEntity } from './driver-survey-response.entity';
import {
  DriverSurveyAnswer,
  DriverSurveyType,
} from './driver-survey-type.enum';
import { SubmitDriverSurveyDto } from './dto/submit-driver-survey.dto';
import {
  RoadConditionArea,
  RoadConditionStateEntity,
} from './road-condition-state.entity';

@Injectable()
export class SurveysService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly driverWork: DriverWorkService,
    private readonly settings: ServiceSettingsService,
    @InjectRepository(DriverSurveyResponseEntity)
    private readonly responses: Repository<DriverSurveyResponseEntity>,
    @InjectRepository(RoadConditionStateEntity)
    private readonly roadStates: Repository<RoadConditionStateEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
  ) {}

  async getDue(driver: AuthenticatedUser) {
    await this.driverWork.assertApprovedDriver(driver);
    const settings = await this.settings.get();
    const items: Array<{
      type: DriverSurveyType;
      question: string;
      answers: DriverSurveyAnswer[];
      allowSuggestion: boolean;
      orderId?: string;
    }> = [];

    if (
      settings.priceSurveyEnabled &&
      (await this.isIntervalDue(
        driver.userId,
        DriverSurveyType.Price,
        settings.priceSurveyIntervalDays,
      ))
    ) {
      items.push({
        type: DriverSurveyType.Price,
        question: settings.priceSurveyQuestion,
        answers: [
          DriverSurveyAnswer.Satisfied,
          DriverSurveyAnswer.NotSatisfied,
        ],
        allowSuggestion: settings.priceSurveyAllowSuggestion,
      });
    }

    if (settings.roadSurveyEnabled) {
      if (
        await this.isIntervalDue(
          driver.userId,
          DriverSurveyType.RoadBgr,
          settings.roadSurveyIntervalDays,
        )
      ) {
        items.push({
          type: DriverSurveyType.RoadBgr,
          question: settings.roadSurveyBgrQuestion,
          answers: [DriverSurveyAnswer.Good, DriverSurveyAnswer.Bad],
          allowSuggestion: false,
        });
      }
      const harborOrder = await this.latestUnansweredHarborOrder(
        driver.userId,
        settings.harborSurveyAfterEachTrip,
        settings.roadSurveyIntervalDays,
      );
      if (harborOrder) {
        items.push({
          type: DriverSurveyType.RoadHarbor,
          question: settings.roadSurveyHarborQuestion,
          answers: [DriverSurveyAnswer.Good, DriverSurveyAnswer.Bad],
          allowSuggestion: false,
          orderId: harborOrder.id,
        });
      }
    }
    return { items };
  }

  async submit(
    type: DriverSurveyType,
    input: SubmitDriverSurveyDto,
    driver: AuthenticatedUser,
  ) {
    await this.driverWork.assertApprovedDriver(driver);
    this.assertAnswer(type, input.answer);
    const response = await this.dataSource.transaction(async (manager) => {
      await this.lockApprovedDriver(manager, driver.userId);
      const settings = await manager
        .getRepository(ServiceSettingsEntity)
        .findOneByOrFail({ id: 1 });
      const suggestion = input.suggestion?.trim() || null;
      await this.assertSurveyCanBeSubmitted(
        manager,
        type,
        input,
        driver.userId,
        settings,
        suggestion,
      );

      const response = await manager
        .getRepository(DriverSurveyResponseEntity)
        .save(
          manager.getRepository(DriverSurveyResponseEntity).create({
            driverUserId: driver.userId,
            surveyType: type,
            answer: input.answer,
            suggestion,
            orderId: input.orderId ?? null,
          }),
        );
      if (type !== DriverSurveyType.Price) {
        await this.updateRoadState(
          manager,
          type === DriverSurveyType.RoadHarbor
            ? RoadConditionArea.Harbor
            : RoadConditionArea.Bgr,
          input.answer,
          settings,
        );
      }
      return response;
    });
    return { id: response.id, createdAt: response.createdAt };
  }

  async roadSurchargeActive(area: RoadConditionArea): Promise<boolean> {
    const state = await this.roadStates.findOneByOrFail({ area });
    return state.surchargeActive;
  }

  private async isIntervalDue(
    driverUserId: string,
    type: DriverSurveyType,
    intervalDays: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const latest = await (
      manager?.getRepository(DriverSurveyResponseEntity) ?? this.responses
    ).findOne({
      where: { driverUserId, surveyType: type },
      order: { createdAt: 'DESC' },
    });
    return (
      !latest ||
      latest.createdAt <=
        new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000)
    );
  }

  private async latestUnansweredHarborOrder(
    driverUserId: string,
    afterEveryTrip: boolean,
    intervalDays: number,
    manager?: EntityManager,
  ): Promise<OrderEntity | null> {
    if (
      !afterEveryTrip &&
      !(await this.isIntervalDue(
        driverUserId,
        DriverSurveyType.RoadHarbor,
        intervalDays,
        manager,
      ))
    ) {
      return null;
    }

    const orders = manager?.getRepository(OrderEntity) ?? this.orders;
    const query = orders
      .createQueryBuilder('ride')
      .where('ride.driverUserId = :driverUserId', { driverUserId })
      .andWhere('ride.status = :status', { status: OrderStatus.Completed })
      .andWhere(
        '(ride.pickupZone IN (:...harborZones) OR ride.destinationZone IN (:...harborZones))',
        {
          harborZones: [ServiceZoneCode.LowerHarbor, ServiceZoneCode.Quarry],
        },
      )
      .orderBy('ride.completedAt', 'DESC');

    if (afterEveryTrip) {
      query.andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM driver_survey_responses response
          WHERE response.driver_user_id = :driverUserId
            AND response.survey_type = :surveyType
            AND response.order_id = ride.id
        )`,
        { surveyType: DriverSurveyType.RoadHarbor },
      );
    } else {
      query.andWhere('ride.completedAt > :after', {
        after: new Date(Date.now() - intervalDays * 24 * 60 * 60 * 1000),
      });
    }
    return query.getOne();
  }

  private async updateRoadState(
    manager: EntityManager,
    area: RoadConditionArea,
    answer: DriverSurveyAnswer,
    settings: ServiceSettingsEntity,
  ): Promise<void> {
    const repository = manager.getRepository(RoadConditionStateEntity);
    const state = await repository
      .createQueryBuilder('state')
      .setLock('pessimistic_write')
      .where('state.area = :area', { area })
      .getOneOrFail();
    if (answer === DriverSurveyAnswer.Bad) {
      state.badVotes += 1;
    } else {
      state.goodVotes += 1;
    }
    const shouldActivate =
      !state.surchargeActive &&
      state.badVotes >= settings.roadBadVotesRequired &&
      state.goodVotes === 0;
    const shouldDisable =
      state.surchargeActive &&
      state.goodVotes >= settings.roadGoodVotesToDisable;
    if (shouldActivate || shouldDisable) {
      state.surchargeActive = shouldActivate;
      state.badVotes = 0;
      state.goodVotes = 0;
      state.stateChangedAt = new Date();
    }
    await repository.save(state);
  }

  private async assertSurveyCanBeSubmitted(
    manager: EntityManager,
    type: DriverSurveyType,
    input: SubmitDriverSurveyDto,
    driverUserId: string,
    settings: ServiceSettingsEntity,
    suggestion: string | null,
  ): Promise<void> {
    if (type === DriverSurveyType.Price) {
      if (!settings.priceSurveyEnabled) {
        throw this.surveyDisabled();
      }
      if (input.orderId) {
        throw this.unexpectedSurveyOrder();
      }
      if (
        !(await this.isIntervalDue(
          driverUserId,
          type,
          settings.priceSurveyIntervalDays,
          manager,
        ))
      ) {
        throw this.surveyNotDue();
      }
      if (suggestion && !settings.priceSurveyAllowSuggestion) {
        throw new BadRequestException({
          code: 'SURVEY_SUGGESTION_DISABLED',
          message: 'Suggestions are disabled for this survey',
        });
      }
      return;
    }

    if (suggestion) {
      throw new BadRequestException({
        code: 'SURVEY_SUGGESTION_NOT_ALLOWED',
        message: 'Suggestions are not allowed for this survey',
      });
    }
    if (!settings.roadSurveyEnabled) {
      throw this.surveyDisabled();
    }
    if (type === DriverSurveyType.RoadBgr) {
      if (input.orderId) {
        throw this.unexpectedSurveyOrder();
      }
      if (
        !(await this.isIntervalDue(
          driverUserId,
          type,
          settings.roadSurveyIntervalDays,
          manager,
        ))
      ) {
        throw this.surveyNotDue();
      }
      return;
    }

    if (!input.orderId) {
      throw new BadRequestException({
        code: 'HARBOR_ORDER_REQUIRED',
        message: 'A completed harbor order is required for this survey',
      });
    }
    const dueOrder = await this.latestUnansweredHarborOrder(
      driverUserId,
      settings.harborSurveyAfterEachTrip,
      settings.roadSurveyIntervalDays,
      manager,
    );
    if (!dueOrder || dueOrder.id !== input.orderId) {
      throw this.surveyNotDue();
    }
  }

  private async lockApprovedDriver(
    manager: EntityManager,
    driverUserId: string,
  ): Promise<void> {
    const profile = await manager
      .getRepository(DriverProfileEntity)
      .createQueryBuilder('profile')
      .setLock('pessimistic_write')
      .where('profile.userId = :driverUserId', { driverUserId })
      .andWhere('profile.verificationStatus = :status', {
        status: DriverVerificationStatus.Approved,
      })
      .getOne();
    if (!profile) {
      throw new ConflictException({
        code: 'APPROVED_DRIVER_REQUIRED',
        message: 'Approved driver access is required',
      });
    }
  }

  private surveyDisabled(): ConflictException {
    return new ConflictException({
      code: 'SURVEY_DISABLED',
      message: 'This survey is currently disabled',
    });
  }

  private surveyNotDue(): ConflictException {
    return new ConflictException({
      code: 'SURVEY_NOT_DUE',
      message: 'This survey is not available yet',
    });
  }

  private unexpectedSurveyOrder(): BadRequestException {
    return new BadRequestException({
      code: 'SURVEY_ORDER_NOT_ALLOWED',
      message: 'This survey must not include an order',
    });
  }

  private assertAnswer(
    type: DriverSurveyType,
    answer: DriverSurveyAnswer,
  ): void {
    const allowed =
      type === DriverSurveyType.Price
        ? [DriverSurveyAnswer.Satisfied, DriverSurveyAnswer.NotSatisfied]
        : [DriverSurveyAnswer.Good, DriverSurveyAnswer.Bad];
    if (!allowed.includes(answer)) {
      throw new BadRequestException({
        code: 'SURVEY_ANSWER_INVALID',
        message: 'Answer is not valid for this survey',
      });
    }
  }
}
