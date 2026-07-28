import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { SurveyTargetRole } from './survey-template.entity';

@Entity({ name: 'user_announcements' })
export class UserAnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 1000 })
  body!: string;

  @Column({ name: 'target_role', type: 'varchar', length: 16, nullable: true })
  targetRole!: SurveyTargetRole | null;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId!: string | null;

  @Column({ name: 'target_phone', type: 'varchar', length: 16, nullable: true })
  targetPhone!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
