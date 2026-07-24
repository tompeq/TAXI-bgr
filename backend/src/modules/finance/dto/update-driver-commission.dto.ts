import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateDriverCommissionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPercentOverride?: number | null;
}
