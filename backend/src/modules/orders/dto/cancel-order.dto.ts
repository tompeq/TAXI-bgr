import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @Length(2, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{2,64}$/)
  reasonCode?: string;
}
