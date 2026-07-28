import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'survey_responses' })
export class SurveyResponseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'survey_id', type: 'uuid' })
  surveyId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  answer!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment!: string | null;

  @Column({ name: 'completed_trip_count', type: 'integer', default: 0 })
  completedTripCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
