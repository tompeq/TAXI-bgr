import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { OrderEntity } from './order.entity';
import { OrderStatus } from './order-status.enum';

@Entity({ name: 'order_status_history' })
export class OrderStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: OrderEntity;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: UserEntity;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    nullable: true,
  })
  previousStatus!: OrderStatus | null;

  @Column({
    name: 'next_status',
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
  })
  nextStatus!: OrderStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
