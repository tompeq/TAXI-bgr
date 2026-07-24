import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceZoneCode } from '../orders/service-zone-code.enum';
import { ServiceZoneEntity } from './service-zone.entity';

@Injectable()
export class ServiceZonesService {
  constructor(
    @InjectRepository(ServiceZoneEntity)
    private readonly zones: Repository<ServiceZoneEntity>,
  ) {}

  async resolve(latitude: number, longitude: number): Promise<ServiceZoneCode> {
    const zone = await this.resolveOrNull(latitude, longitude);
    if (zone) {
      return zone;
    }
    throw new BadRequestException({
      code: 'ADDRESS_OUTSIDE_SERVICE_AREA',
      message: 'Address is outside the service area',
    });
  }

  async resolveOrNull(
    latitude: number,
    longitude: number,
  ): Promise<ServiceZoneCode | null> {
    const result = await this.zones
      .createQueryBuilder('zone')
      .select('zone.code', 'code')
      .where('zone.is_active = true')
      .andWhere(
        'ST_Covers(zone.boundary, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326))',
        { latitude, longitude },
      )
      .orderBy('ST_Area(zone.boundary)', 'ASC')
      .getRawOne<{ code: string }>();
    return result &&
      Object.values(ServiceZoneCode).includes(result.code as ServiceZoneCode)
      ? (result.code as ServiceZoneCode)
      : null;
  }
}
