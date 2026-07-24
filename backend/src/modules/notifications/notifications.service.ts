import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { DeviceRegistrationEntity } from './device-registration.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NotificationSender, PushMessage } from './notification-sender';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(DeviceRegistrationEntity)
    private readonly devices: Repository<DeviceRegistrationEntity>,
    private readonly sender: NotificationSender,
  ) {}

  get enabled(): boolean {
    return this.sender.enabled;
  }

  async registerDevice(
    currentUser: AuthenticatedUser,
    input: RegisterDeviceDto,
  ) {
    const token = input.token.trim();
    let device = await this.devices.findOneBy({ token });
    if (!device) {
      device = this.devices.create({ token });
    }
    device.userId = currentUser.userId;
    device.platform = input.platform;
    device.deviceName = input.deviceName?.trim() || null;
    device.enabled = true;
    device.lastSeenAt = new Date();
    const saved = await this.devices.save(device);
    return { id: saved.id, enabled: saved.enabled };
  }

  async unregisterDevice(
    currentUser: AuthenticatedUser,
    token: string,
  ): Promise<void> {
    await this.devices.update(
      { userId: currentUser.userId, token: token.trim() },
      { enabled: false, lastSeenAt: new Date() },
    );
  }

  async sendToUsers(userIds: string[], message: PushMessage): Promise<void> {
    if (!this.sender.enabled || userIds.length === 0) {
      return;
    }
    const devices = await this.devices.findBy({
      userId: In([...new Set(userIds)]),
      enabled: true,
    });
    const tokens = devices.map((device) => device.token);
    const result = await this.sender.send(tokens, message);
    if (result.invalidTokens.length > 0) {
      await this.devices.update(
        { token: In(result.invalidTokens) },
        { enabled: false },
      );
    }
  }
}
