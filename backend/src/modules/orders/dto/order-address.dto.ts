import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsString, Length } from 'class-validator';

export class OrderAddressDto {
  @ApiProperty({ example: 'Кирова, 12' })
  @IsString()
  @Length(2, 300)
  address!: string;

  @ApiProperty({ example: 52.3661 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 140.4358 })
  @IsLongitude()
  longitude!: number;
}
