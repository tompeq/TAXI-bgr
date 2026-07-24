import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('conversation')
  @ApiOperation({ summary: 'Get the current passenger or driver conversation' })
  getConversation(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.support.getCurrentConversation(currentUser);
  }

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a support message as a passenger or driver' })
  sendMessage(
    @Body() input: CreateSupportMessageDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.support.sendCurrentUserMessage(currentUser, input);
  }
}
