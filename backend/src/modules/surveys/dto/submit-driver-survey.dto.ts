import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DriverSurveyAnswer } from '../driver-survey-type.enum';

export class SubmitDriverSurveyDto {
  @IsEnum(DriverSurveyAnswer)
  answer!: DriverSurveyAnswer;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  suggestion?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
