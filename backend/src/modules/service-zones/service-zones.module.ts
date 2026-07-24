import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceZoneEntity } from './service-zone.entity';
import { ServiceZonesService } from './service-zones.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceZoneEntity])],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService, TypeOrmModule],
})
export class ServiceZonesModule {}
