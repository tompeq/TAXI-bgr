import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class SubmitOrderRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  comment?: string;
}
