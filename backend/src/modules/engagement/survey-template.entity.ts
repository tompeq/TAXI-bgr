import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export enum SurveyTargetRole {
  Passenger = 'passenger',
  Driver = 'driver',
  All = 'all',
}

@Entity({ name: 'survey_templates' })
export class SurveyTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  question!: string;

  @Column({ name: 'target_role', type: 'varchar', length: 16 })
  targetRole!: SurveyTargetRole;

  @Column({
    name: 'answer_options',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  answerOptions!: string[];

  @Column({ name: 'allow_comment', type: 'boolean', default: true })
  allowComment!: boolean;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt!: Date | null;

  @Column({ name: 'display_time', type: 'time', nullable: true })
  displayTime!: string | null;

  @Column({ name: 'frequency_days', type: 'integer', nullable: true })
  frequencyDays!: number | null;

  @Column({
    name: 'every_completed_trips',
    type: 'integer',
    nullable: true,
  })
  everyCompletedTrips!: number | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
