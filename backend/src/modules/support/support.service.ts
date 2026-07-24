import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ActivityEventsService } from '../activity-events/activity-events.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserEntity } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { ListSupportConversationsDto } from './dto/list-support-conversations.dto';
import { UpdateSupportConversationDto } from './dto/update-support-conversation.dto';
import { SupportConversationEntity } from './support-conversation.entity';
import { SupportConversationStatus } from './support-conversation-status.enum';
import { SupportMessageEntity } from './support-message.entity';

@Injectable()
export class SupportService {
  constructor(
    private readonly activityEvents: ActivityEventsService,
    @InjectRepository(SupportConversationEntity)
    private readonly conversations: Repository<SupportConversationEntity>,
    @InjectRepository(SupportMessageEntity)
    private readonly messages: Repository<SupportMessageEntity>,
  ) {}

  async getCurrentConversation(currentUser: AuthenticatedUser) {
    this.assertParticipant(currentUser);
    const conversation = await this.findConversationByUserId(
      currentUser.userId,
    );
    return conversation ? this.toConversation(conversation) : null;
  }

  async sendCurrentUserMessage(
    currentUser: AuthenticatedUser,
    input: CreateSupportMessageDto,
  ) {
    this.assertParticipant(currentUser);
    const conversation = await this.getOrCreateConversation(currentUser.userId);
    await this.createMessage(
      conversation.id,
      currentUser,
      input.body,
      'support_message_sent',
    );
    return this.getCurrentConversation(currentUser);
  }

  async listForAdmin(query: ListSupportConversationsDto) {
    const where = query.status ? { status: query.status } : {};
    const [conversations, total] = await this.conversations.findAndCount({
      where,
      relations: { user: true },
      order: { updatedAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const lastMessages = await Promise.all(
      conversations.map((conversation) =>
        this.messages.findOne({
          where: { conversationId: conversation.id },
          relations: { sender: true },
          order: { createdAt: 'DESC' },
        }),
      ),
    );
    return {
      items: conversations.map((conversation, index) =>
        this.toConversationSummary(conversation, lastMessages[index]),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getForAdmin(conversationId: string) {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    return this.toConversation(conversation);
  }

  async sendAdminMessage(
    conversationId: string,
    admin: AuthenticatedUser,
    input: CreateSupportMessageDto,
  ) {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw this.conversationNotFound();
    }
    await this.createMessage(
      conversation.id,
      admin,
      input.body,
      'support_message_sent',
    );
    return this.getForAdmin(conversation.id);
  }

  async updateStatus(
    conversationId: string,
    input: UpdateSupportConversationDto,
    admin: AuthenticatedUser,
  ) {
    const conversation = await this.conversations.findOneBy({
      id: conversationId,
    });
    if (!conversation) {
      throw this.conversationNotFound();
    }
    conversation.status = input.status;
    const saved = await this.conversations.save(conversation);
    await this.activityEvents.record({
      eventType: 'support_conversation_status_updated',
      actorUserId: admin.userId,
      entityType: 'support_conversation',
      entityId: saved.id,
      metadata: { status: saved.status, participantUserId: saved.userId },
    });
    return this.getForAdmin(saved.id);
  }

  private async getOrCreateConversation(userId: string) {
    const existing = await this.conversations.findOneBy({ userId });
    if (existing) {
      return existing;
    }
    try {
      return await this.conversations.save(
        this.conversations.create({
          userId,
          status: SupportConversationStatus.Open,
        }),
      );
    } catch (error: unknown) {
      if (
        !(error instanceof QueryFailedError) ||
        (error.driverError as { code?: unknown }).code !== '23505'
      ) {
        throw error;
      }
      return this.conversations.findOneByOrFail({ userId });
    }
  }

  private async createMessage(
    conversationId: string,
    sender: AuthenticatedUser,
    body: string,
    eventType: string,
  ): Promise<void> {
    const trimmedBody = body.trim();
    await this.messages.manager.transaction(async (manager) => {
      const conversations = manager.getRepository(SupportConversationEntity);
      const conversation = await conversations.findOneByOrFail({
        id: conversationId,
      });
      conversation.status = SupportConversationStatus.Open;
      conversation.updatedAt = new Date();
      await conversations.save(conversation);
      const message = await manager.getRepository(SupportMessageEntity).save(
        manager.getRepository(SupportMessageEntity).create({
          conversationId,
          senderUserId: sender.userId,
          body: trimmedBody,
        }),
      );
      await this.recordMessageEvent(
        manager,
        eventType,
        sender,
        conversation,
        message,
      );
    });
  }

  private recordMessageEvent(
    manager: EntityManager,
    eventType: string,
    sender: AuthenticatedUser,
    conversation: SupportConversationEntity,
    message: SupportMessageEntity,
  ) {
    return this.activityEvents.record(
      {
        eventType,
        actorUserId: sender.userId,
        entityType: 'support_message',
        entityId: message.id,
        metadata: {
          conversationId: conversation.id,
          participantUserId: conversation.userId,
        },
      },
      manager,
    );
  }

  private findConversationByUserId(userId: string) {
    return this.conversations
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.user', 'user')
      .leftJoinAndSelect('conversation.messages', 'message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('conversation.userId = :userId', { userId })
      .orderBy('message.createdAt', 'ASC')
      .getOne();
  }

  private findConversationById(conversationId: string) {
    return this.conversations
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.user', 'user')
      .leftJoinAndSelect('conversation.messages', 'message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('conversation.id = :conversationId', { conversationId })
      .orderBy('message.createdAt', 'ASC')
      .getOne();
  }

  private toConversation(conversation: SupportConversationEntity) {
    return {
      id: conversation.id,
      status: conversation.status,
      participant: this.toParticipant(conversation.user),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: (conversation.messages ?? []).map((message) =>
        this.toMessage(message),
      ),
    };
  }

  private toConversationSummary(
    conversation: SupportConversationEntity,
    lastMessage: SupportMessageEntity | null,
  ) {
    return {
      id: conversation.id,
      status: conversation.status,
      participant: this.toParticipant(conversation.user),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastMessage: lastMessage ? this.toMessage(lastMessage) : null,
    };
  }

  private toParticipant(user: UserEntity) {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    };
  }

  private toMessage(message: SupportMessageEntity) {
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      sender: this.toParticipant(message.sender),
    };
  }

  private assertParticipant(currentUser: AuthenticatedUser): void {
    if (currentUser.role === UserRole.Admin) {
      throw new ForbiddenException({
        code: 'SUPPORT_PARTICIPANT_REQUIRED',
        message: 'Use the admin support endpoint for administrator messages',
      });
    }
  }

  private conversationNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'SUPPORT_CONVERSATION_NOT_FOUND',
      message: 'Support conversation was not found',
    });
  }
}
