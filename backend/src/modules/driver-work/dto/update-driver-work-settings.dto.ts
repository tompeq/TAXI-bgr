import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateDriverWorkSettingsDto {
  @IsOptional()
  @IsBoolean()
  acceptsTaxi?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  backgroundNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  nightNotifications?: boolean;
}
