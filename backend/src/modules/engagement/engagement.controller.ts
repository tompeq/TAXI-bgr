import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateOrderMessageDto } from './dto/create-order-message.dto';
import { SubmitOrderRatingDto } from './dto/submit-order-rating.dto';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto';
import { EngagementService } from './engagement.service';

@ApiTags('engagement')
@ApiBearerAuth()
@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('orders/:orderId/messages')
  @ApiOperation({ summary: 'List passenger-driver messages for an order' })
  orderMessages(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.engagement.listOrderMessages(orderId, currentUser);
  }

  @Post('orders/:orderId/messages')
  @ApiOperation({ summary: 'Send a passenger-driver order message' })
  sendOrderMessage(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() input: CreateOrderMessageDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.engagement.sendOrderMessage(orderId, input, currentUser);
  }

  @Get('engagement/ratings/pending')
  pendingRatings(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.engagement.pendingRatings(currentUser);
  }

  @Post('orders/:orderId/rating')
  submitRating(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() input: SubmitOrderRatingDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.engagement.submitRating(orderId, input, currentUser);
  }

  @Get('engagement/surveys/due')
  dueSurveys(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.engagement.dueSurveys(currentUser);
  }

  @Post('engagement/surveys/:surveyId/responses')
  submitSurvey(
    @Param('surveyId', new ParseUUIDPipe()) surveyId: string,
    @Body() input: SubmitSurveyResponseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.engagement.submitSurveyResponse(surveyId, input, currentUser);
  }

  @Get('engagement/announcements/pending')
  pendingAnnouncements(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.engagement.pendingAnnouncements(currentUser);
  }

  @Post('engagement/announcements/:announcementId/acknowledge')
  @HttpCode(HttpStatus.OK)
  acknowledgeAnnouncement(
    @Param('announcementId', new ParseUUIDPipe()) announcementId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.engagement.acknowledgeAnnouncement(announcementId, currentUser);
  }
}
