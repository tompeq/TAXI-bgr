import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverProfileEntity } from './driver-profile.entity';
import { UserEntity } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DriverProfileEntity])],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
