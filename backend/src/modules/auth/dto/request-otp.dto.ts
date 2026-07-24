import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+79141234567' })
  @Matches(/^\+[1-9][0-9]{7,14}$/, {
    message: 'phone must use E.164 format',
  })
  phone!: string;
}
