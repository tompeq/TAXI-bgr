import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { SupportConversationEntity } from './support-conversation.entity';

@Entity({ name: 'support_messages' })
export class SupportMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(
    () => SupportConversationEntity,
    (conversation) => conversation.messages,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'conversation_id' })
  conversation!: SupportConversationEntity;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_user_id' })
  sender!: UserEntity;

  @Column({ type: 'varchar', length: 1000 })
  body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
