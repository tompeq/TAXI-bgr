import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class RegisterDriverDto {
  @ApiProperty()
  @IsString()
  registrationToken!: string;

  @ApiProperty({ example: 'Иванов Иван Иванович' })
  @IsString()
  @Length(5, 200)
  fullName!: string;

  @ApiProperty({ example: 'drivers/licenses/example.jpg' })
  @IsString()
  @Length(1, 512)
  licensePhotoKey!: string;

  @ApiProperty({ example: 'drivers/licenses/example-back.jpg' })
  @IsString()
  @Length(1, 512)
  licensePhotoBackKey!: string;

  @ApiProperty({ example: 'Toyota Corolla' })
  @IsString()
  @Length(2, 120)
  vehicleMakeModel!: string;

  @ApiProperty({ example: 'Белый' })
  @IsString()
  @Length(2, 60)
  vehicleColor!: string;

  @ApiProperty({ example: 'А123ВС27' })
  @IsString()
  @Length(4, 20)
  vehiclePlate!: string;

  @ApiProperty({
    type: [String],
    minItems: 4,
    maxItems: 4,
    example: [
      'drivers/cars/front.jpg',
      'drivers/cars/back.jpg',
      'drivers/cars/left.jpg',
      'drivers/cars/right.jpg',
    ],
  })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 512, { each: true })
  carPhotoKeys!: string[];

  @ApiPropertyOptional({ example: 'Android phone' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  deviceName?: string;
}
