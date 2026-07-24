import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverWorkService } from './driver-work.service';
import { StartBreakDto } from './dto/start-break.dto';
import { UpdateDriverWorkSettingsDto } from './dto/update-driver-work-settings.dto';

@ApiTags('driver work')
@ApiBearerAuth()
@Controller('driver/work')
export class DriverWorkController {
  constructor(private readonly driverWork: DriverWorkService) {}

  @Get()
  @ApiOperation({ summary: 'Get shift, settings and 24-hour earnings' })
  getState(@CurrentUser() driver: AuthenticatedUser) {
    return this.driverWork.getState(driver);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start or restore the active driver shift' })
  start(@CurrentUser() driver: AuthenticatedUser) {
    return this.driverWork.start(driver);
  }

  @Post('end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the current shift' })
  end(@CurrentUser() driver: AuthenticatedUser) {
    return this.driverWork.end(driver);
  }

  @Post('break')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a 10, 30 or 60 minute break' })
  startBreak(
    @Body() input: StartBreakDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.driverWork.startBreak(driver, input);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a break early' })
  resume(@CurrentUser() driver: AuthenticatedUser) {
    return this.driverWork.resume(driver);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update accepted services and notifications' })
  updateSettings(
    @Body() input: UpdateDriverWorkSettingsDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.driverWork.updateSettings(driver, input);
  }
}
