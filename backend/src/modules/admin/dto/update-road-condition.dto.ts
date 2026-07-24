import { IsBoolean } from 'class-validator';

export class UpdateRoadConditionDto {
  @IsBoolean()
  surchargeActive!: boolean;
}
