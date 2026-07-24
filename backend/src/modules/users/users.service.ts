import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverProfileEntity } from './driver-profile.entity';
import { UserEntity } from './user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfiles: Repository<DriverProfileEntity>,
  ) {}

  findByPhoneAndRole(
    phone: string,
    role: UserRole,
  ): Promise<UserEntity | null> {
    return this.users.findOneBy({ phone, role });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOneBy({ id });
  }

  findDriverProfile(userId: string): Promise<DriverProfileEntity | null> {
    return this.driverProfiles.findOneBy({ userId });
  }
}
