import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class UpdateServiceSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  acceptedOrderTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  freeWaitingMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  waitingPricePerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  arrivalSoonMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  driverBoardAnnouncement?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsBoolean()
  priceSurveyEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  priceSurveyIntervalDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  priceSurveyQuestion?: string;

  @IsOptional()
  @IsBoolean()
  priceSurveyAllowSuggestion?: boolean;

  @IsOptional()
  @IsBoolean()
  roadSurveyEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  roadSurveyIntervalDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  roadSurveyBgrQuestion?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  roadSurveyHarborQuestion?: string;

  @IsOptional()
  @IsBoolean()
  harborSurveyAfterEachTrip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  roadBadVotesRequired?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  roadGoodVotesToDisable?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  roadSurchargePercent?: number;
}
