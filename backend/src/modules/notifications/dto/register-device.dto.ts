import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DevicePlatform } from '../device-platform.enum';

export class RegisterDeviceDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
