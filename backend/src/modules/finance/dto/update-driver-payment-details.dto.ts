import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateDriverPaymentDetailsDto {
  @IsString()
  @Matches(/^(?:\+7|7|8)\d{10}$/)
  transferPhone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  transferBank!: string;
}
