import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'order_ratings' })
@Index('order_ratings_author_unique', ['orderId', 'authorUserId'], {
  unique: true,
})
export class OrderRatingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId!: string;

  @Column({ name: 'target_user_id', type: 'uuid' })
  targetUserId!: string;

  @Column({ type: 'smallint' })
  score!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
