import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { SupportConversationStatus } from './support-conversation-status.enum';
import { SupportMessageEntity } from './support-message.entity';

@Entity({ name: 'support_conversations' })
export class SupportConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({
    type: 'varchar',
    length: 16,
    default: SupportConversationStatus.Open,
  })
  status!: SupportConversationStatus;

  @OneToMany(() => SupportMessageEntity, (message) => message.conversation)
  messages!: SupportMessageEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
