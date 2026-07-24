import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DriverReviewDecision {
  Approve = 'approve',
  Reject = 'reject',
  RequestChanges = 'request_changes',
  Block = 'block',
}

export class ReviewDriverDto {
  @IsEnum(DriverReviewDecision)
  decision!: DriverReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
