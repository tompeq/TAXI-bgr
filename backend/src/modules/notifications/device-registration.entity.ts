import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DevicePlatform } from './device-platform.enum';

@Entity({ name: 'device_registrations' })
export class DeviceRegistrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  token!: string;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
    enumName: 'device_platform',
  })
  platform!: DevicePlatform;

  @Column({ name: 'device_name', type: 'varchar', length: 120, nullable: true })
  deviceName!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
