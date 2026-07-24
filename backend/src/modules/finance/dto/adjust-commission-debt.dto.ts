import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdjustCommissionDebtDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  targetDebt!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
