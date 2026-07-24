import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverProfileEntity } from '../users/driver-profile.entity';
import { UserEntity } from '../users/user.entity';
import { RegistrationUploadsCleanupService } from './registration-uploads-cleanup.service';
import { StorageService } from './storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DriverProfileEntity])],
  providers: [StorageService, RegistrationUploadsCleanupService],
  exports: [StorageService],
})
export class StorageModule {}
