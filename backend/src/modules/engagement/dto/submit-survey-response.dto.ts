import { IsOptional, IsString, Length } from 'class-validator';

export class SubmitSurveyResponseDto {
  @IsOptional()
  @IsString()
  @Length(1, 300)
  answer?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  comment?: string;
}
