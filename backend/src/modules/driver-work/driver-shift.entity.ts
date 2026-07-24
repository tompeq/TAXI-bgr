import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { DriverWorkStatus } from './driver-work-status.enum';

@Entity({ name: 'driver_shifts' })
export class DriverShiftEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_user_id', type: 'uuid' })
  driverUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_user_id' })
  driver!: UserEntity;

  @Column({
    type: 'enum',
    enum: DriverWorkStatus,
    enumName: 'driver_work_status',
    default: DriverWorkStatus.Online,
  })
  status!: DriverWorkStatus;

  @Column({ name: 'break_until', type: 'timestamptz', nullable: true })
  breakUntil!: Date | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
