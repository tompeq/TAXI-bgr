import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DriverSurveyType } from './driver-survey-type.enum';
import { SubmitDriverSurveyDto } from './dto/submit-driver-survey.dto';
import { SurveysService } from './surveys.service';

@ApiTags('driver surveys')
@ApiBearerAuth()
@Controller('driver/surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Get('due')
  @ApiOperation({ summary: 'List surveys currently due for the driver' })
  getDue(@CurrentUser() driver: AuthenticatedUser) {
    return this.surveys.getDue(driver);
  }

  @Post(':type/responses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a driver survey response' })
  submit(
    @Param('type', new ParseEnumPipe(DriverSurveyType)) type: DriverSurveyType,
    @Body() input: SubmitDriverSurveyDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.surveys.submit(type, input, driver);
  }
}
