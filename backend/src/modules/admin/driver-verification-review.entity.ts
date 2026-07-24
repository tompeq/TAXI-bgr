import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { DriverVerificationStatus } from '../users/driver-verification-status.enum';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'driver_verification_reviews' })
export class DriverVerificationReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_profile_id', type: 'uuid' })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfileEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_profile_id' })
  driverProfile!: DriverProfileEntity;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewer!: UserEntity;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: DriverVerificationStatus,
    enumName: 'driver_verification_status',
  })
  previousStatus!: DriverVerificationStatus;

  @Column({
    name: 'decision_status',
    type: 'enum',
    enum: DriverVerificationStatus,
    enumName: 'driver_verification_status',
  })
  decisionStatus!: DriverVerificationStatus;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
