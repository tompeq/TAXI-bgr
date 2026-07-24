import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderKind } from '../order-kind.enum';
import { OrderPaymentMethod } from '../order-payment-method.enum';
import { OrderAddressDto } from './order-address.dto';

export class CreateOrderDto {
  @ApiProperty({ type: OrderAddressDto })
  @ValidateNested()
  @Type(() => OrderAddressDto)
  pickup!: OrderAddressDto;

  @ApiProperty({ type: OrderAddressDto })
  @ValidateNested()
  @Type(() => OrderAddressDto)
  destination!: OrderAddressDto;

  @ApiProperty({ enum: OrderKind })
  @IsEnum(OrderKind)
  kind!: OrderKind;

  @ApiProperty({ enum: OrderPaymentMethod })
  @IsEnum(OrderPaymentMethod)
  paymentMethod!: OrderPaymentMethod;

  @ApiProperty({ minimum: 1, maximum: 3, description: '3 means 3 or more' })
  @IsInt()
  @Min(1)
  @Max(3)
  passengerCount!: number;

  @ApiProperty()
  @IsBoolean()
  roundTrip!: boolean;

  @ApiPropertyOptional({
    minimum: 10,
    maximum: 200000,
    description: 'Road distance calculated by the map client in meters',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(10)
  @Max(200000)
  routeDistanceMeters?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Omit for an immediate order',
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}
