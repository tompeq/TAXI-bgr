import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrderBoardDto } from './dto/list-order-board.dto';
import { OrderKind } from './order-kind.enum';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate the current server-side fare' })
  quote(
    @Body() input: CreateOrderDto,
    @CurrentUser() passenger: AuthenticatedUser,
  ) {
    return this.orders.quote(input, passenger);
  }

  @Post()
  @ApiOperation({ summary: 'Create a passenger order with server-side fare' })
  create(
    @Body() input: CreateOrderDto,
    @CurrentUser() passenger: AuthenticatedUser,
  ) {
    return this.orders.create(input, passenger);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the current passenger or driver order' })
  getActive(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.orders.getActive(currentUser);
  }

  @Get('availability')
  @ApiOperation({ summary: 'Check whether drivers are currently on the line' })
  getAvailability(
    @Query('kind', new ParseEnumPipe(OrderKind)) kind: OrderKind,
    @CurrentUser() passenger: AuthenticatedUser,
  ) {
    return this.orders.getAvailability(kind, passenger);
  }

  @Get('board')
  @ApiOperation({ summary: 'List open orders for an approved driver' })
  listBoard(
    @Query() query: ListOrderBoardDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.orders.listBoard(query, driver);
  }

  @Get('reservations')
  @ApiOperation({ summary: 'List future orders reserved by the driver' })
  reservations(@CurrentUser() driver: AuthenticatedUser) {
    return this.orders.listDriverReservations(driver);
  }

  @Get(':orderId/transfer-details')
  @ApiOperation({
    summary: 'Get the assigned driver transfer details for a passenger order',
  })
  getTransferDetails(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() passenger: AuthenticatedUser,
  ) {
    return this.orders.getTransferDetails(orderId, passenger);
  }

  @Post(':orderId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically accept an open order' })
  accept(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.orders.accept(orderId, driver);
  }

  @Patch(':orderId/status')
  @ApiOperation({ summary: 'Move an assigned order to its next state' })
  updateStatus(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() input: UpdateOrderStatusDto,
    @CurrentUser() driver: AuthenticatedUser,
  ) {
    return this.orders.updateStatus(orderId, input.status, driver);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an owned passenger or driver order' })
  cancel(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() input: CancelOrderDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.orders.cancel(orderId, input, currentUser);
  }
}
