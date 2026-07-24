import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'activity_events' })
export class ActivityEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 80, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
