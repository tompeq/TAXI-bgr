import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { SurveyTargetRole } from '../survey-template.entity';

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 1000)
  body?: string;

  @IsOptional()
  @IsEnum(SurveyTargetRole)
  targetRole?: SurveyTargetRole | null;

  @IsOptional()
  @IsUUID()
  targetUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
