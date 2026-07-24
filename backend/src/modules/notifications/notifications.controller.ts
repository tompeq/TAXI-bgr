import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/devices')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register or refresh a push notification token' })
  register(
    @Body() input: RegisterDeviceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notifications.registerDevice(currentUser, input);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable a push notification token' })
  async unregister(
    @Body() input: UnregisterDeviceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    await this.notifications.unregisterDevice(currentUser, input.token);
  }
}
