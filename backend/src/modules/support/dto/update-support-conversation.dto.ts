import { IsEnum } from 'class-validator';
import { SupportConversationStatus } from '../support-conversation-status.enum';

export class UpdateSupportConversationDto {
  @IsEnum(SupportConversationStatus)
  status!: SupportConversationStatus;
}
