import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, QueryFailedError, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderEntity } from '../orders/order.entity';
import { OrderStatus } from '../orders/order-status.enum';
import { UserEntity } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateOrderMessageDto } from './dto/create-order-message.dto';
import { SubmitOrderRatingDto } from './dto/submit-order-rating.dto';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpsertSurveyDto } from './dto/upsert-survey.dto';
import { OrderMessageEntity } from './order-message.entity';
import { OrderRatingEntity } from './order-rating.entity';
import { SurveyResponseEntity } from './survey-response.entity';
import {
  SurveyTargetRole,
  SurveyTemplateEntity,
} from './survey-template.entity';
import { UserAnnouncementReceiptEntity } from './user-announcement-receipt.entity';
import { UserAnnouncementEntity } from './user-announcement.entity';

@Injectable()
export class EngagementService {
  private readonly businessTimeZone: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    config: ConfigService,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(OrderMessageEntity)
    private readonly messages: Repository<OrderMessageEntity>,
    @InjectRepository(OrderRatingEntity)
    private readonly ratings: Repository<OrderRatingEntity>,
    @InjectRepository(SurveyTemplateEntity)
    private readonly surveys: Repository<SurveyTemplateEntity>,
    @InjectRepository(SurveyResponseEntity)
    private readonly surveyResponses: Repository<SurveyResponseEntity>,
    @InjectRepository(UserAnnouncementEntity)
    private readonly announcements: Repository<UserAnnouncementEntity>,
    @InjectRepository(UserAnnouncementReceiptEntity)
    private readonly announcementReceipts: Repository<UserAnnouncementReceiptEntity>,
  ) {
    this.businessTimeZone = config.getOrThrow<string>('BUSINESS_TIME_ZONE');
  }

  async listOrderMessages(orderId: string, currentUser: AuthenticatedUser) {
    await this.assertOrderParticipant(orderId, currentUser);
    const messages = await this.messages.find({
      where: { orderId },
      relations: { sender: true },
      order: { createdAt: 'ASC' },
      take: 300,
    });
    return { items: messages.map((message) => this.messageResponse(message)) };
  }

  async sendOrderMessage(
    orderId: string,
    input: CreateOrderMessageDto,
    currentUser: AuthenticatedUser,
  ) {
    const order = await this.assertOrderParticipant(orderId, currentUser);
    if (!order.driverUserId) {
      throw new ConflictException({
        code: 'ORDER_CHAT_NOT_READY',
        message: 'The chat becomes available after a driver accepts the order',
      });
    }
    if (
      ![
        OrderStatus.Accepted,
        OrderStatus.DriverEnRoute,
        OrderStatus.Arrived,
        OrderStatus.Waiting,
        OrderStatus.Started,
      ].includes(order.status)
    ) {
      throw new ConflictException({
        code: 'ORDER_CHAT_CLOSED',
        message: 'The chat is closed because the order is no longer active',
      });
    }
    const message = await this.messages.save(
      this.messages.create({
        orderId,
        senderUserId: currentUser.userId,
        body: input.body.trim(),
      }),
    );
    const saved = await this.messages.findOneOrFail({
      where: { id: message.id },
      relations: { sender: true },
    });
    const recipientId =
      currentUser.userId === order.passengerUserId
        ? order.driverUserId
        : order.passengerUserId;
    await this.notifications.sendToUsers([recipientId], {
      title: 'Новое сообщение по заказу',
      body: saved.body,
      data: { type: 'order_chat', orderId },
    });
    return this.messageResponse(saved);
  }

  async pendingRatings(currentUser: AuthenticatedUser) {
    if (![UserRole.Passenger, UserRole.Driver].includes(currentUser.role)) {
      throw this.mobileRoleRequired();
    }
    const ownershipColumn =
      currentUser.role === UserRole.Passenger
        ? 'order.passengerUserId'
        : 'order.driverUserId';
    const orders = await this.orders
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.passenger', 'passenger')
      .leftJoinAndSelect('order.driver', 'driver')
      .where('order.status = :status', { status: OrderStatus.Completed })
      .andWhere(`${ownershipColumn} = :userId`, { userId: currentUser.userId })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM order_ratings rating
          WHERE rating.order_id = "order"."id"
            AND rating.author_user_id = :userId
        )`,
        { userId: currentUser.userId },
      )
      .orderBy('order.completedAt', 'DESC')
      .take(10)
      .getMany();
    return {
      items: orders.map((order) => {
        const target =
          currentUser.role === UserRole.Passenger
            ? order.driver
            : order.passenger;
        return {
          orderId: order.id,
          target: target
            ? { id: target.id, name: target.name, role: target.role }
            : null,
          completedAt: order.completedAt,
        };
      }),
    };
  }

  async submitRating(
    orderId: string,
    input: SubmitOrderRatingDto,
    currentUser: AuthenticatedUser,
  ) {
    const order = await this.assertOrderParticipant(orderId, currentUser);
    if (order.status !== OrderStatus.Completed || !order.driverUserId) {
      throw new ConflictException({
        code: 'ORDER_RATING_NOT_AVAILABLE',
        message: 'Only a completed order can be rated',
      });
    }
    const targetUserId =
      currentUser.userId === order.passengerUserId
        ? order.driverUserId
        : order.passengerUserId;
    try {
      const rating = await this.ratings.save(
        this.ratings.create({
          orderId,
          authorUserId: currentUser.userId,
          targetUserId,
          score: input.score,
          comment: input.comment?.trim() || null,
        }),
      );
      return { id: rating.id, createdAt: rating.createdAt };
    } catch (error: unknown) {
      if (
        !(error instanceof QueryFailedError) ||
        (error.driverError as { code?: unknown }).code !== '23505'
      ) {
        throw error;
      }
      throw new ConflictException({
        code: 'ORDER_ALREADY_RATED',
        message: 'This order has already been rated by this user',
      });
    }
  }

  async dueSurveys(currentUser: AuthenticatedUser) {
    if (![UserRole.Passenger, UserRole.Driver].includes(currentUser.role)) {
      throw this.mobileRoleRequired();
    }
    const now = new Date();
    const targetRole =
      currentUser.role === UserRole.Driver
        ? SurveyTargetRole.Driver
        : SurveyTargetRole.Passenger;
    const candidates = await this.surveys.find({
      where: [
        { enabled: true, targetRole },
        { enabled: true, targetRole: SurveyTargetRole.All },
      ],
      order: { createdAt: 'ASC' },
    });
    const completedTripCount = await this.completedTripCount(currentUser);
    const items: SurveyTemplateEntity[] = [];
    for (const survey of candidates) {
      if (survey.startsAt && survey.startsAt > now) {
        continue;
      }
      if (!this.isAfterDisplayTime(survey.displayTime, now)) {
        continue;
      }
      const latest = await this.surveyResponses.findOne({
        where: { surveyId: survey.id, userId: currentUser.userId },
        order: { createdAt: 'DESC' },
      });
      if (this.isSurveyDue(survey, latest, completedTripCount, now)) {
        items.push(survey);
      }
    }
    return { items: items.map((survey) => this.surveyResponse(survey)) };
  }

  async submitSurveyResponse(
    surveyId: string,
    input: SubmitSurveyResponseDto,
    currentUser: AuthenticatedUser,
  ) {
    const due = await this.dueSurveys(currentUser);
    const survey = due.items.find((item) => item.id === surveyId);
    if (!survey) {
      throw new ConflictException({
        code: 'SURVEY_NOT_DUE',
        message: 'This survey is not available now',
      });
    }
    const answer = input.answer?.trim() || null;
    const comment = input.comment?.trim() || null;
    if (!answer && !comment) {
      throw new BadRequestException({
        code: 'SURVEY_RESPONSE_EMPTY',
        message: 'An answer or comment is required',
      });
    }
    if (answer && !survey.answerOptions.includes(answer)) {
      throw new BadRequestException({
        code: 'SURVEY_ANSWER_INVALID',
        message: 'The selected answer is not available',
      });
    }
    if (comment && !survey.allowComment) {
      throw new BadRequestException({
        code: 'SURVEY_COMMENT_DISABLED',
        message: 'Comments are disabled for this survey',
      });
    }
    const saved = await this.surveyResponses.save(
      this.surveyResponses.create({
        surveyId,
        userId: currentUser.userId,
        answer,
        comment,
        completedTripCount: await this.completedTripCount(currentUser),
      }),
    );
    return { id: saved.id, createdAt: saved.createdAt };
  }

  async pendingAnnouncements(currentUser: AuthenticatedUser) {
    if (![UserRole.Passenger, UserRole.Driver].includes(currentUser.role)) {
      throw this.mobileRoleRequired();
    }
    const currentPhone = await this.userPhone(currentUser.userId);
    const rows = await this.announcements
      .createQueryBuilder('announcement')
      .where('announcement.enabled = true')
      .andWhere(
        new Brackets((query) => {
          query
            .where('announcement.targetUserId = :userId', {
              userId: currentUser.userId,
            })
            .orWhere('announcement.targetPhone = :phone', {
              phone: currentPhone,
            })
            .orWhere('announcement.targetRole = :role', {
              role: currentUser.role,
            })
            .orWhere('announcement.targetRole = :all', {
              all: SurveyTargetRole.All,
            });
        }),
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM user_announcement_receipts receipt
          WHERE receipt.announcement_id = announcement.id
            AND receipt.user_id = :userId
        )`,
        { userId: currentUser.userId },
      )
      .orderBy('announcement.createdAt', 'ASC')
      .getMany();
    return { items: rows.map((row) => this.announcementResponse(row)) };
  }

  async acknowledgeAnnouncement(
    announcementId: string,
    currentUser: AuthenticatedUser,
  ) {
    if (![UserRole.Passenger, UserRole.Driver].includes(currentUser.role)) {
      throw this.mobileRoleRequired();
    }
    const announcement = await this.announcements.findOneBy({
      id: announcementId,
      enabled: true,
    });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: 'Announcement was not found',
      });
    }
    const targetRole =
      currentUser.role === UserRole.Driver
        ? SurveyTargetRole.Driver
        : SurveyTargetRole.Passenger;
    const currentPhone = await this.userPhone(currentUser.userId);
    const matchesTarget =
      announcement.targetUserId === currentUser.userId ||
      announcement.targetPhone === currentPhone ||
      announcement.targetRole === targetRole ||
      announcement.targetRole === SurveyTargetRole.All;
    if (!matchesTarget) {
      throw new ForbiddenException({
        code: 'ANNOUNCEMENT_ACCESS_DENIED',
        message: 'This announcement is not intended for the current user',
      });
    }
    await this.announcementReceipts.upsert(
      {
        announcementId,
        userId: currentUser.userId,
        acknowledgedAt: new Date(),
      },
      ['announcementId', 'userId'],
    );
    return { acknowledged: true };
  }

  async adminListSurveys() {
    const rows = await this.surveys.find({
      order: { updatedAt: 'DESC' },
    });
    const counts = await this.surveyResponses
      .createQueryBuilder('response')
      .select('response.surveyId', 'surveyId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('response.surveyId')
      .getRawMany<{ surveyId: string; count: string }>();
    const countMap = new Map(
      counts.map((item) => [item.surveyId, Number(item.count)]),
    );
    return {
      items: rows.map((row) => ({
        ...this.surveyResponse(row),
        responseCount: countMap.get(row.id) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async adminCreateSurvey(input: UpsertSurveyDto, admin: AuthenticatedUser) {
    const survey = await this.surveys.save(
      this.surveys.create({
        ...this.surveyFields(input),
        createdByUserId: admin.userId,
      }),
    );
    return this.surveyResponse(survey);
  }

  async adminUpdateSurvey(id: string, input: UpsertSurveyDto) {
    const survey = await this.surveys.findOneBy({ id });
    if (!survey) {
      throw this.surveyNotFound();
    }
    Object.assign(survey, this.surveyFields(input));
    return this.surveyResponse(await this.surveys.save(survey));
  }

  async adminSurveyResponses(id: string) {
    const survey = await this.surveys.findOneBy({ id });
    if (!survey) {
      throw this.surveyNotFound();
    }
    const responses = await this.surveyResponses
      .createQueryBuilder('response')
      .innerJoinAndMapOne(
        'response.user',
        UserEntity,
        'user',
        'user.id = response.userId',
      )
      .where('response.surveyId = :id', { id })
      .orderBy('response.createdAt', 'DESC')
      .getMany();
    return {
      survey: this.surveyResponse(survey),
      items: responses.map((response) => {
        const user = (response as SurveyResponseEntity & { user: UserEntity })
          .user;
        return {
          id: response.id,
          answer: response.answer,
          comment: response.comment,
          createdAt: response.createdAt,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            role: user.role,
          },
        };
      }),
    };
  }

  async adminListAnnouncements() {
    const rows = await this.announcements.find({
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((row) => this.announcementResponse(row)) };
  }

  async adminCreateAnnouncement(
    input: CreateAnnouncementDto,
    admin: AuthenticatedUser,
  ) {
    const targetPhone = input.targetPhone?.trim()
      ? this.normalizeAnnouncementPhone(input.targetPhone)
      : null;
    this.assertAnnouncementTarget(
      input.targetRole,
      input.targetUserId,
      targetPhone,
    );
    const targetUsers = targetPhone
      ? await this.dataSource
          .getRepository(UserEntity)
          .find({ where: { phone: targetPhone } })
      : [];
    if (targetPhone && targetUsers.length === 0) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_PHONE_NOT_FOUND',
        message: 'No registered user has this phone number',
      });
    }
    const saved = await this.announcements.save(
      this.announcements.create({
        title: input.title.trim(),
        body: input.body.trim(),
        targetRole: input.targetRole ?? null,
        targetUserId: input.targetUserId ?? null,
        targetPhone,
        enabled: input.enabled ?? true,
        createdByUserId: admin.userId,
      }),
    );
    if (saved.enabled && targetUsers.length > 0) {
      await this.notifications.sendToUsers(
        targetUsers.map((user) => user.id),
        {
          title: saved.title,
          body: saved.body,
          data: { type: 'announcement', announcementId: saved.id },
        },
      );
    }
    return this.announcementResponse(saved);
  }

  async adminUpdateAnnouncement(id: string, input: UpdateAnnouncementDto) {
    const announcement = await this.announcements.findOneBy({ id });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: 'Announcement was not found',
      });
    }
    const targetRole =
      input.targetRole === undefined
        ? announcement.targetRole
        : input.targetRole;
    const targetUserId =
      input.targetUserId === undefined
        ? announcement.targetUserId
        : input.targetUserId;
    const targetPhone =
      input.targetPhone === undefined
        ? announcement.targetPhone
        : input.targetPhone?.trim()
          ? this.normalizeAnnouncementPhone(input.targetPhone)
          : null;
    this.assertAnnouncementTarget(targetRole, targetUserId, targetPhone);
    if (targetPhone) {
      const matchingUsers = await this.dataSource
        .getRepository(UserEntity)
        .countBy({ phone: targetPhone });
      if (matchingUsers === 0) {
        throw new NotFoundException({
          code: 'ANNOUNCEMENT_PHONE_NOT_FOUND',
          message: 'No registered user has this phone number',
        });
      }
    }
    if (input.title !== undefined) announcement.title = input.title.trim();
    if (input.body !== undefined) announcement.body = input.body.trim();
    if (input.enabled !== undefined) announcement.enabled = input.enabled;
    announcement.targetRole = targetRole;
    announcement.targetUserId = targetUserId;
    announcement.targetPhone = targetPhone;
    return this.announcementResponse(
      await this.announcements.save(announcement),
    );
  }

  async adminReputation() {
    const users = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .leftJoin(OrderRatingEntity, 'rating', 'rating.targetUserId = user.id')
      .select('user.id', 'id')
      .addSelect('user.name', 'name')
      .addSelect('user.phone', 'phone')
      .addSelect('user.role', 'role')
      .addSelect('COALESCE(AVG(rating.score), 0)', 'averageRating')
      .addSelect('COUNT(rating.id)', 'ratingCount')
      .where('user.role IN (:...roles)', {
        roles: [UserRole.Passenger, UserRole.Driver],
      })
      .groupBy('user.id')
      .orderBy('AVG(rating.score)', 'ASC', 'NULLS FIRST')
      .getRawMany<{
        id: string;
        name: string;
        phone: string;
        role: UserRole;
        averageRating: string;
        ratingCount: string;
      }>();
    const cancellations = await this.orders
      .createQueryBuilder('order')
      .innerJoin(UserEntity, 'actor', 'actor.id = order.canceledByUserId')
      .select('order.passengerUserId', 'passengerUserId')
      .addSelect(
        "COALESCE(order.cancellationReasonCode, order.cancellationReason, 'other')",
        'reason',
      )
      .addSelect('COUNT(*)', 'count')
      .where('order.status = :status', { status: OrderStatus.Canceled })
      .andWhere('actor.role = :driverRole', { driverRole: UserRole.Driver })
      .groupBy('order.passengerUserId')
      .addGroupBy(
        "COALESCE(order.cancellationReasonCode, order.cancellationReason, 'other')",
      )
      .getRawMany<{
        passengerUserId: string;
        reason: string;
        count: string;
      }>();
    const cancellationMap = new Map<
      string,
      Array<{ reason: string; count: number }>
    >();
    for (const item of cancellations) {
      const values = cancellationMap.get(item.passengerUserId) ?? [];
      values.push({ reason: item.reason, count: Number(item.count) });
      cancellationMap.set(item.passengerUserId, values);
    }
    return {
      items: users.map((user) => ({
        ...user,
        averageRating: Number(user.averageRating),
        ratingCount: Number(user.ratingCount),
        driverCancellationReasons: cancellationMap.get(user.id) ?? [],
      })),
    };
  }

  async adminUserRatings(userId: string) {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({
      id: userId,
    });
    if (!user || ![UserRole.Passenger, UserRole.Driver].includes(user.role)) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Passenger or driver was not found',
      });
    }
    const items = await this.ratings
      .createQueryBuilder('rating')
      .innerJoin(UserEntity, 'author', 'author.id = rating.authorUserId')
      .select('rating.id', 'id')
      .addSelect('rating.orderId', 'orderId')
      .addSelect('rating.score', 'score')
      .addSelect('rating.comment', 'comment')
      .addSelect('rating.createdAt', 'createdAt')
      .addSelect('author.id', 'authorId')
      .addSelect('author.name', 'authorName')
      .addSelect('author.phone', 'authorPhone')
      .addSelect('author.role', 'authorRole')
      .where('rating.targetUserId = :userId', { userId })
      .orderBy('rating.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        orderId: string;
        score: string;
        comment: string | null;
        createdAt: Date;
        authorId: string;
        authorName: string;
        authorPhone: string;
        authorRole: UserRole;
      }>();
    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      items: items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        score: Number(item.score),
        comment: item.comment,
        createdAt: item.createdAt,
        author: {
          id: item.authorId,
          name: item.authorName,
          phone: item.authorPhone,
          role: item.authorRole,
        },
      })),
    };
  }

  private async assertOrderParticipant(
    orderId: string,
    currentUser: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const order = await this.orders.findOne({
      where: { id: orderId },
      relations: { passenger: true, driver: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order was not found',
      });
    }
    if (
      order.passengerUserId !== currentUser.userId &&
      order.driverUserId !== currentUser.userId
    ) {
      throw new ForbiddenException({
        code: 'ORDER_ACCESS_DENIED',
        message: 'This order does not belong to the current user',
      });
    }
    return order;
  }

  private messageResponse(message: OrderMessageEntity) {
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        name: message.sender.name,
        role: message.sender.role,
      },
    };
  }

  private async completedTripCount(
    currentUser: AuthenticatedUser,
  ): Promise<number> {
    return this.orders.count({
      where:
        currentUser.role === UserRole.Driver
          ? {
              driverUserId: currentUser.userId,
              status: OrderStatus.Completed,
            }
          : {
              passengerUserId: currentUser.userId,
              status: OrderStatus.Completed,
            },
    });
  }

  private isSurveyDue(
    survey: SurveyTemplateEntity,
    latest: SurveyResponseEntity | null,
    completedTripCount: number,
    now: Date,
  ): boolean {
    if (!latest) {
      return (
        survey.everyCompletedTrips === null ||
        completedTripCount >= survey.everyCompletedTrips
      );
    }
    if (survey.frequencyDays === null && survey.everyCompletedTrips === null) {
      return false;
    }
    const intervalDue =
      survey.frequencyDays !== null &&
      latest.createdAt <=
        new Date(now.getTime() - survey.frequencyDays * 86_400_000);
    const tripsDue =
      survey.everyCompletedTrips !== null &&
      completedTripCount - latest.completedTripCount >=
        survey.everyCompletedTrips;
    return intervalDue || tripsDue;
  }

  private isAfterDisplayTime(displayTime: string | null, now: Date): boolean {
    if (!displayTime) {
      return true;
    }
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.businessTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const [targetHour, targetMinute] = displayTime
      .slice(0, 5)
      .split(':')
      .map(Number);
    return hour * 60 + minute >= targetHour * 60 + targetMinute;
  }

  private surveyFields(input: UpsertSurveyDto) {
    return {
      title: input.title.trim(),
      question: input.question.trim(),
      targetRole: input.targetRole,
      answerOptions: input.answerOptions
        .map((option) => option.trim())
        .filter(Boolean),
      allowComment: input.allowComment,
      enabled: input.enabled,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      displayTime: input.displayTime || null,
      frequencyDays: input.frequencyDays ?? null,
      everyCompletedTrips: input.everyCompletedTrips ?? null,
    };
  }

  private surveyResponse(survey: SurveyTemplateEntity) {
    return {
      id: survey.id,
      title: survey.title,
      question: survey.question,
      targetRole: survey.targetRole,
      answerOptions: survey.answerOptions,
      allowComment: survey.allowComment,
      enabled: survey.enabled,
      startsAt: survey.startsAt,
      displayTime: survey.displayTime?.slice(0, 5) ?? null,
      frequencyDays: survey.frequencyDays,
      everyCompletedTrips: survey.everyCompletedTrips,
      version: survey.version,
    };
  }

  private announcementResponse(announcement: UserAnnouncementEntity) {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      targetRole: announcement.targetRole,
      targetUserId: announcement.targetUserId,
      targetPhone: announcement.targetPhone,
      enabled: announcement.enabled,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    };
  }

  private assertAnnouncementTarget(
    targetRole?: SurveyTargetRole | null,
    targetUserId?: string | null,
    targetPhone?: string | null,
  ): void {
    const targetCount = [targetRole, targetUserId, targetPhone].filter(
      (value) => value != null,
    ).length;
    if (targetCount !== 1) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENT_TARGET_REQUIRED',
        message: 'Exactly one announcement target is required',
      });
    }
  }

  private normalizeAnnouncementPhone(value: string): string {
    const raw = value.trim();
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `7${digits}`;
    } else if (digits.length === 11 && digits.startsWith('8')) {
      digits = `7${digits.slice(1)}`;
    }
    const normalized = `+${digits}`;
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENT_PHONE_INVALID',
        message: 'Phone must use a valid international format',
      });
    }
    return normalized;
  }

  private async userPhone(userId: string): Promise<string> {
    const user = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: userId }, select: { phone: true } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User was not found',
      });
    }
    return user.phone;
  }

  private surveyNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'SURVEY_NOT_FOUND',
      message: 'Survey was not found',
    });
  }

  private mobileRoleRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'MOBILE_ROLE_REQUIRED',
      message: 'Passenger or driver access is required',
    });
  }
}
