import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrderKind } from '../orders/order-kind.enum';
import { ServiceZoneCode } from '../orders/service-zone-code.enum';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { ListDriverApplicationsDto } from './dto/list-driver-applications.dto';
import { ReviewDriverDto } from './dto/review-driver.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import { UpdateServiceSettingsDto } from '../service-settings/dto/update-service-settings.dto';
import { RoadConditionArea } from '../surveys/road-condition-state.entity';
import { UpdateRoadConditionDto } from './dto/update-road-condition.dto';
import { UpdateDriverCommissionDto } from '../finance/dto/update-driver-commission.dto';
import { AdjustCommissionDebtDto } from '../finance/dto/adjust-commission-debt.dto';
import { RecordCommissionSettlementDto } from '../finance/dto/record-commission-settlement.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get administrator dashboard counters' })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('driver-finance')
  @ApiOperation({ summary: 'List driver earnings and commission debts' })
  listDriverFinances() {
    return this.adminService.listDriverFinances();
  }

  @Get('tariffs')
  @ApiOperation({ summary: 'List editable fares for every service and zone' })
  listTariffs() {
    return this.adminService.listTariffs();
  }

  @Patch('tariffs/:kind/:zone')
  @ApiOperation({ summary: 'Update day, evening and night fares' })
  updateTariff(
    @Param('kind', new ParseEnumPipe(OrderKind)) kind: OrderKind,
    @Param('zone', new ParseEnumPipe(ServiceZoneCode)) zone: ServiceZoneCode,
    @Body() input: UpdateTariffDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateTariff(kind, zone, input, admin);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get editable service and survey settings' })
  getSettings() {
    return this.adminService.getServiceSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update service and survey settings' })
  updateSettings(
    @Body() input: UpdateServiceSettingsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateServiceSettings(input, admin);
  }

  @Get('road-conditions')
  @ApiOperation({ summary: 'Get current road surcharge states' })
  getRoadConditions() {
    return this.adminService.getRoadConditions();
  }

  @Patch('road-conditions/:area')
  @ApiOperation({ summary: 'Manually enable or disable a road surcharge' })
  updateRoadCondition(
    @Param('area', new ParseEnumPipe(RoadConditionArea))
    area: RoadConditionArea,
    @Body() input: UpdateRoadConditionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateRoadCondition(area, input, admin);
  }

  @Get('drivers')
  @ApiOperation({ summary: 'List driver verification applications' })
  listDrivers(@Query() query: ListDriverApplicationsDto) {
    return this.adminService.listDriverApplications(query);
  }

  @Get('drivers/:profileId')
  @ApiOperation({ summary: 'Get a driver application with document links' })
  getDriver(@Param('profileId', new ParseUUIDPipe()) profileId: string) {
    return this.adminService.getDriverApplication(profileId);
  }

  @Patch('drivers/:profileId/review')
  @ApiOperation({ summary: 'Review a driver application' })
  reviewDriver(
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Body() input: ReviewDriverDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.reviewDriver(profileId, input, admin);
  }

  @Patch('drivers/:profileId/commission')
  @ApiOperation({
    summary: 'Set or clear an individual driver commission rate',
  })
  updateDriverCommission(
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Body() input: UpdateDriverCommissionDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.updateDriverCommission(profileId, input, admin);
  }

  @Patch('drivers/:profileId/commission-debt')
  @ApiOperation({ summary: 'Set a driver commission debt to an exact amount' })
  adjustDriverCommissionDebt(
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Body() input: AdjustCommissionDebtDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.adjustDriverCommissionDebt(
      profileId,
      input,
      admin,
    );
  }

  @Post('drivers/:profileId/commission-settlements')
  @ApiOperation({ summary: 'Confirm a manual transfer from a driver' })
  recordDriverCommissionSettlement(
    @Param('profileId', new ParseUUIDPipe()) profileId: string,
    @Body() input: RecordCommissionSettlementDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.adminService.recordDriverCommissionSettlement(
      profileId,
      input,
      admin,
    );
  }
}
