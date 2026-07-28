import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { SurveyTargetRole } from '../survey-template.entity';

export class CreateAnnouncementDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsString()
  @Length(2, 1000)
  body!: string;

  @IsOptional()
  @IsEnum(SurveyTargetRole)
  targetRole?: SurveyTargetRole | null;

  @IsOptional()
  @IsUUID()
  targetUserId?: string | null;

  @IsOptional()
  @IsString()
  @Length(10, 24)
  targetPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
