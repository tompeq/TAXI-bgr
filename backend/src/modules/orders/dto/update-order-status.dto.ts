import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../order-status.enum';

export class OrderCompletionLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsNumber()
  @Min(0)
  @Max(500)
  accuracyMeters!: number;

  @IsISO8601()
  recordedAt!: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderCompletionLocationDto)
  completionLocation?: OrderCompletionLocationDto;
}
