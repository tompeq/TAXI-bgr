import { IsIn } from 'class-validator';

export class StartBreakDto {
  @IsIn([10, 30, 60])
  minutes!: 10 | 30 | 60;
}
