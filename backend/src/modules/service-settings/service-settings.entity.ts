import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'service_settings' })
export class ServiceSettingsEntity {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id!: number;

  @Column({ name: 'accepted_order_timeout_seconds', type: 'integer' })
  acceptedOrderTimeoutSeconds!: number;

  @Column({ name: 'free_waiting_minutes', type: 'integer' })
  freeWaitingMinutes!: number;

  @Column({ name: 'waiting_base_fee', type: 'integer', default: 50 })
  waitingBaseFee!: number;

  @Column({ name: 'waiting_price_per_minute', type: 'integer' })
  waitingPricePerMinute!: number;

  @Column({ name: 'arrival_soon_minutes', type: 'integer' })
  arrivalSoonMinutes!: number;

  @Column({
    name: 'driver_board_announcement',
    type: 'varchar',
    length: 500,
    default: '',
  })
  driverBoardAnnouncement!: string;

  @Column({ name: 'commission_percent', type: 'smallint', default: 0 })
  commissionPercent!: number;

  @Column({ name: 'price_survey_enabled', type: 'boolean' })
  priceSurveyEnabled!: boolean;

  @Column({ name: 'price_survey_interval_days', type: 'integer' })
  priceSurveyIntervalDays!: number;

  @Column({ name: 'price_survey_question', type: 'varchar', length: 300 })
  priceSurveyQuestion!: string;

  @Column({ name: 'price_survey_allow_suggestion', type: 'boolean' })
  priceSurveyAllowSuggestion!: boolean;

  @Column({ name: 'road_survey_enabled', type: 'boolean' })
  roadSurveyEnabled!: boolean;

  @Column({ name: 'road_survey_interval_days', type: 'integer' })
  roadSurveyIntervalDays!: number;

  @Column({ name: 'road_survey_bgr_question', type: 'varchar', length: 300 })
  roadSurveyBgrQuestion!: string;

  @Column({ name: 'road_survey_harbor_question', type: 'varchar', length: 300 })
  roadSurveyHarborQuestion!: string;

  @Column({ name: 'harbor_survey_after_each_trip', type: 'boolean' })
  harborSurveyAfterEachTrip!: boolean;

  @Column({ name: 'road_bad_votes_required', type: 'integer' })
  roadBadVotesRequired!: number;

  @Column({ name: 'road_good_votes_to_disable', type: 'integer' })
  roadGoodVotesToDisable!: number;

  @Column({ name: 'road_surcharge_percent', type: 'integer' })
  roadSurchargePercent!: number;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId!: string | null;

  @VersionColumn()
  version!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
