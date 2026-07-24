import type { Point } from 'geojson';
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
import { OrderPaymentMethod } from './order-payment-method.enum';
import { OrderStatus } from './order-status.enum';
import { OrderPricingMode } from './order-pricing-mode.enum';
import { ServiceZoneCode } from './service-zone-code.enum';
import { TariffSettingEntity } from './tariff-setting.entity';
import { TariffPeriod } from './tariff-period.enum';

@Entity({ name: 'orders' })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'passenger_user_id', type: 'uuid' })
  passengerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'passenger_user_id' })
  passenger!: UserEntity;

  @Column({ name: 'driver_user_id', type: 'uuid', nullable: true })
  driverUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'driver_user_id' })
  driver!: UserEntity | null;

  @Column({ type: 'enum', enum: OrderKind, enumName: 'order_kind' })
  kind!: OrderKind;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: OrderPaymentMethod,
    enumName: 'order_payment_method',
  })
  paymentMethod!: OrderPaymentMethod;

  @Column({ name: 'passenger_count', type: 'smallint' })
  passengerCount!: number;

  @Column({ name: 'round_trip', type: 'boolean', default: false })
  roundTrip!: boolean;

  @Column({ name: 'pickup_address', type: 'varchar', length: 300 })
  pickupAddress!: string;

  @Column({
    name: 'pickup_point',
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  pickupPoint!: Point;

  @Column({
    name: 'pickup_zone',
    type: 'enum',
    enum: ServiceZoneCode,
    enumName: 'service_zone_code',
  })
  pickupZone!: ServiceZoneCode;

  @Column({ name: 'destination_address', type: 'varchar', length: 300 })
  destinationAddress!: string;

  @Column({
    name: 'destination_point',
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  destinationPoint!: Point;

  @Column({
    name: 'destination_zone',
    type: 'enum',
    enum: ServiceZoneCode,
    enumName: 'service_zone_code',
  })
  destinationZone!: ServiceZoneCode;

  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor!: Date | null;

  @Column({
    name: 'scheduled_announced_at',
    type: 'timestamptz',
    nullable: true,
  })
  scheduledAnnouncedAt!: Date | null;

  @Column({ name: 'tariff_setting_id', type: 'uuid' })
  tariffSettingId!: string;

  @ManyToOne(() => TariffSettingEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tariff_setting_id' })
  tariffSetting!: TariffSettingEntity;

  @Column({ name: 'tariff_version', type: 'integer' })
  tariffVersion!: number;

  @Column({
    name: 'pricing_mode',
    type: 'enum',
    enum: OrderPricingMode,
    enumName: 'order_pricing_mode',
    default: OrderPricingMode.Fixed,
  })
  pricingMode!: OrderPricingMode;

  @Column({ name: 'route_distance_meters', type: 'integer', nullable: true })
  routeDistanceMeters!: number | null;

  @Column({ name: 'distance_rate_per_km', type: 'integer', nullable: true })
  distanceRatePerKm!: number | null;

  @Column({ name: 'fare_amount', type: 'integer' })
  fareAmount!: number;

  @Column({
    name: 'tariff_period',
    type: 'enum',
    enum: TariffPeriod,
    enumName: 'tariff_period',
  })
  tariffPeriod!: TariffPeriod;

  @Column({ name: 'road_surcharge_amount', type: 'integer', default: 0 })
  roadSurchargeAmount!: number;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.Open,
  })
  status!: OrderStatus;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'driver_en_route_at', type: 'timestamptz', nullable: true })
  driverEnRouteAt!: Date | null;

  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt!: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'waiting_started_at', type: 'timestamptz', nullable: true })
  waitingStartedAt!: Date | null;

  @Column({ name: 'waiting_charge_amount', type: 'integer', default: 0 })
  waitingChargeAmount!: number;

  @Column({ name: 'cancellation_fee_amount', type: 'integer', default: 0 })
  cancellationFeeAmount!: number;

  @Column({ name: 'commission_rate_percent', type: 'smallint', default: 0 })
  commissionRatePercent!: number;

  @Column({ name: 'commission_amount', type: 'integer', default: 0 })
  commissionAmount!: number;

  @Column({ name: 'transfer_declared_at', type: 'timestamptz', nullable: true })
  transferDeclaredAt!: Date | null;

  @Column({ name: 'arrival_notified_at', type: 'timestamptz', nullable: true })
  arrivalNotifiedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt!: Date | null;

  @Column({ name: 'canceled_by_user_id', type: 'uuid', nullable: true })
  canceledByUserId!: string | null;

  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancellationReason!: string | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
