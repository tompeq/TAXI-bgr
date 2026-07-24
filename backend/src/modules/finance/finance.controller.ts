import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateDriverPaymentDetailsDto } from './dto/update-driver-payment-details.dto';
import { FinanceService } from './finance.service';

@ApiTags('driver-finance')
@ApiBearerAuth()
@Controller('driver/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('payment-details')
  @ApiOperation({ summary: 'Get the signed-in driver transfer details' })
  getPaymentDetails(@CurrentUser() driver: AuthenticatedUser) {
    return this.finance.getDriverPaymentDetails(driver);
  }

  @Patch('payment-details')
  @ApiOperation({ summary: 'Update the signed-in driver transfer details' })
  updatePaymentDetails(
    @Body() input: UpdateDriverPaymentDetailsDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.finance.updateDriverPaymentDetails(driver, input);
  }
}
