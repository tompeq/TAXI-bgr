import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class RegisterPassengerDto {
  @ApiProperty()
  @IsString()
  registrationToken!: string;

  @ApiProperty({ example: 'Анна' })
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 512)
  avatarObjectKey?: string;

  @ApiPropertyOptional({ example: 'Android phone' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  deviceName?: string;
}
