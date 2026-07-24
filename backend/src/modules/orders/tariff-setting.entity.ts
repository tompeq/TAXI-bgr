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
import { OrderKind } from './order-kind.enum';
import { ServiceZoneCode } from './service-zone-code.enum';

@Entity({ name: 'tariff_settings' })
export class TariffSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: OrderKind, enumName: 'order_kind' })
  kind!: OrderKind;

  @Column({
    type: 'enum',
    enum: ServiceZoneCode,
    enumName: 'service_zone_code',
  })
  zone!: ServiceZoneCode;

  @Column({ name: 'day_fare', type: 'integer' })
  dayFare!: number;

  @Column({ name: 'evening_fare', type: 'integer' })
  eveningFare!: number;

  @Column({ name: 'night_fare', type: 'integer' })
  nightFare!: number;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy!: UserEntity | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
