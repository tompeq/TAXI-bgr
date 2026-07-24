import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SupportConversationStatus } from '../support-conversation-status.enum';

export class ListSupportConversationsDto {
  @IsOptional()
  @IsEnum(SupportConversationStatus)
  status?: SupportConversationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}
