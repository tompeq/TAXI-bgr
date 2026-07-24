import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'driver_work_settings' })
export class DriverWorkSettingsEntity {
  @PrimaryColumn({ name: 'driver_user_id', type: 'uuid' })
  driverUserId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driver_user_id' })
  driver!: UserEntity;

  @Column({ name: 'accepts_taxi', type: 'boolean', default: true })
  acceptsTaxi!: boolean;

  @Column({ name: 'accepts_delivery', type: 'boolean', default: true })
  acceptsDelivery!: boolean;

  @Column({
    name: 'background_notifications',
    type: 'boolean',
    default: true,
  })
  backgroundNotifications!: boolean;

  @Column({ name: 'night_notifications', type: 'boolean', default: false })
  nightNotifications!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
