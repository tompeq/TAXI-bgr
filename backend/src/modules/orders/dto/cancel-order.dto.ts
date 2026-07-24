import { IsString, Length } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @Length(2, 500)
  reason!: string;
}
