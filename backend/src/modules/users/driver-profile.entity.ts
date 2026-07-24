import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { DriverVerificationStatus } from './driver-verification-status.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'driver_profiles' })
export class DriverProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => UserEntity, (user) => user.driverProfile, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName!: string;

  @Column({ name: 'license_photo_key', type: 'varchar', length: 512 })
  licensePhotoKey!: string;

  @Column({
    name: 'license_photo_back_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  licensePhotoBackKey!: string | null;

  @Column({
    name: 'vehicle_make_model',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  vehicleMakeModel!: string | null;

  @Column({
    name: 'vehicle_color',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  vehicleColor!: string | null;

  @Column({
    name: 'vehicle_plate',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  vehiclePlate!: string | null;

  @Column({
    name: 'car_photo_keys',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  carPhotoKeys!: string[];

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: DriverVerificationStatus,
    enumName: 'driver_verification_status',
    default: DriverVerificationStatus.Pending,
  })
  verificationStatus!: DriverVerificationStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment!: string | null;

  @Column({ name: 'blocked_reason', type: 'text', nullable: true })
  blockedReason!: string | null;

  @Column({
    name: 'transfer_phone',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  transferPhone!: string | null;

  @Column({
    name: 'transfer_bank',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  transferBank!: string | null;

  @Column({
    name: 'commission_percent_override',
    type: 'smallint',
    nullable: true,
  })
  commissionPercentOverride!: number | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
