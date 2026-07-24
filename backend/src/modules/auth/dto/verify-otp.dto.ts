import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Length, Matches } from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class VerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^[0-9]{6}$/)
  code!: string;

  @ApiProperty({
    enum: [UserRole.Passenger, UserRole.Driver, UserRole.Admin],
    example: UserRole.Passenger,
  })
  @IsIn([UserRole.Passenger, UserRole.Driver, UserRole.Admin])
  role!: UserRole;

  @ApiPropertyOptional({ example: 'Android phone' })
  @IsOptional()
  @Length(1, 160)
  deviceName?: string;
}
