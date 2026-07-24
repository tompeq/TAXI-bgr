import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordCommissionSettlementDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
