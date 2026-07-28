import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SurveyTargetRole } from '../survey-template.entity';

export class UpsertSurveyDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsString()
  @Length(3, 500)
  question!: string;

  @IsEnum(SurveyTargetRole)
  targetRole!: SurveyTargetRole;

  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  answerOptions!: string[];

  @IsBoolean()
  allowComment!: boolean;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  displayTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  frequencyDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  everyCompletedTrips?: number | null;
}
