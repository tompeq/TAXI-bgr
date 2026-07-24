import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin/admin.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateSupportMessageDto } from './dto/create-support-message.dto';
import { ListSupportConversationsDto } from './dto/list-support-conversations.dto';
import { UpdateSupportConversationDto } from './dto/update-support-conversation.dto';
import { SupportService } from './support.service';

@ApiTags('admin support')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List passenger and driver support conversations' })
  listConversations(@Query() query: ListSupportConversationsDto) {
    return this.support.listForAdmin(query);
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Read a support conversation' })
  getConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.support.getForAdmin(conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply to a passenger or driver' })
  sendMessage(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() input: CreateSupportMessageDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.support.sendAdminMessage(conversationId, admin, input);
  }

  @Patch('conversations/:conversationId')
  @ApiOperation({ summary: 'Open or close a support conversation' })
  updateConversation(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() input: UpdateSupportConversationDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.support.updateStatus(conversationId, input, admin);
  }
}
