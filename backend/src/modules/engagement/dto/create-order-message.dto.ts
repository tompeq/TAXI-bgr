import { IsString, Length } from 'class-validator';

export class CreateOrderMessageDto {
  @IsString()
  @Length(1, 1000)
  body!: string;
}
