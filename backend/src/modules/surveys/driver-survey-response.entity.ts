import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  DriverSurveyAnswer,
  DriverSurveyType,
} from './driver-survey-type.enum';

@Entity({ name: 'driver_survey_responses' })
export class DriverSurveyResponseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_user_id', type: 'uuid' })
  driverUserId!: string;

  @Column({
    name: 'survey_type',
    type: 'enum',
    enum: DriverSurveyType,
    enumName: 'driver_survey_type',
  })
  surveyType!: DriverSurveyType;

  @Column({
    type: 'enum',
    enum: DriverSurveyAnswer,
    enumName: 'driver_survey_answer',
  })
  answer!: DriverSurveyAnswer;

  @Column({ type: 'varchar', length: 500, nullable: true })
  suggestion!: string | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
