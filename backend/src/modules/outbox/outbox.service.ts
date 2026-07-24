import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxEventEntity } from './outbox-event.entity';

export interface EnqueueOutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repository: Repository<OutboxEventEntity>,
  ) {}

  async enqueue(
    input: EnqueueOutboxEvent,
    manager?: EntityManager,
  ): Promise<OutboxEventEntity> {
    const repository =
      manager?.getRepository(OutboxEventEntity) ?? this.repository;
    return repository.save(repository.create(input));
  }
}
