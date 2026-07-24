import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshSessionDto {
  @ApiProperty()
  @IsString()
  @Length(40, 200)
  refreshToken!: string;
}
