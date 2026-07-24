import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateTariffDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  dayFare!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  eveningFare!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  nightFare!: number;
}
