import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { UserRole } from './user-role.enum';
import { UserStatus } from './user-status.enum';
import { DriverProfileEntity } from './driver-profile.entity';

@Entity({ name: 'users' })
@Index('users_phone_role_unique_idx', ['phone', 'role'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  phone!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.Active,
  })
  status!: UserStatus;

  @Column({
    name: 'avatar_object_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  avatarObjectKey!: string | null;

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt!: Date | null;

  @OneToOne(() => DriverProfileEntity, (profile) => profile.user)
  driverProfile?: DriverProfileEntity;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
