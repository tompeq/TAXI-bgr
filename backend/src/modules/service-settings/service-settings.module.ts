import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceSettingsEntity } from './service-settings.entity';
import { ServiceSettingsService } from './service-settings.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ServiceSettingsEntity])],
  providers: [ServiceSettingsService],
  exports: [ServiceSettingsService, TypeOrmModule],
})
export class ServiceSettingsModule {}
