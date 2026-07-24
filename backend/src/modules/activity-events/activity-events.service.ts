import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ActivityEventEntity } from './activity-event.entity';

export interface RecordActivityEvent {
  eventType: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityEventsService {
  constructor(
    @InjectRepository(ActivityEventEntity)
    private readonly repository: Repository<ActivityEventEntity>,
  ) {}

  async record(
    input: RecordActivityEvent,
    manager?: EntityManager,
  ): Promise<ActivityEventEntity> {
    const repository =
      manager?.getRepository(ActivityEventEntity) ?? this.repository;
    const event = repository.create({
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });
    return repository.save(event);
  }
}
