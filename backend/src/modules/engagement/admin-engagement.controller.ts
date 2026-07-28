import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { UpsertSurveyDto } from './dto/upsert-survey.dto';
import { EngagementService } from './engagement.service';

@ApiTags('admin engagement')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminEngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('surveys')
  surveys() {
    return this.engagement.adminListSurveys();
  }

  @Post('surveys')
  createSurvey(
    @Body() input: UpsertSurveyDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.engagement.adminCreateSurvey(input, admin);
  }

  @Put('surveys/:id')
  updateSurvey(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpsertSurveyDto,
  ) {
    return this.engagement.adminUpdateSurvey(id, input);
  }

  @Get('surveys/:id/responses')
  surveyResponses(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.engagement.adminSurveyResponses(id);
  }

  @Get('announcements')
  announcements() {
    return this.engagement.adminListAnnouncements();
  }

  @Post('announcements')
  createAnnouncement(
    @Body() input: CreateAnnouncementDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.engagement.adminCreateAnnouncement(input, admin);
  }

  @Patch('announcements/:id')
  updateAnnouncement(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateAnnouncementDto,
  ) {
    return this.engagement.adminUpdateAnnouncement(id, input);
  }

  @Get('reputation')
  reputation() {
    return this.engagement.adminReputation();
  }

  @Get('reputation/:userId/ratings')
  reputationRatings(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.engagement.adminUserRatings(userId);
  }
}
