import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceSettingsEntity } from './service-settings.entity';

@Injectable()
export class ServiceSettingsService {
  constructor(
    @InjectRepository(ServiceSettingsEntity)
    private readonly settings: Repository<ServiceSettingsEntity>,
  ) {}

  get(): Promise<ServiceSettingsEntity> {
    return this.settings.findOneByOrFail({ id: 1 });
  }
}
