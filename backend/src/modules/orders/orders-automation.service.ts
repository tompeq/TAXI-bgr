import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersAutomationService {
  private readonly logger = new Logger(OrdersAutomationService.name);

  constructor(private readonly orders: OrdersService) {}

  @Cron('*/15 * * * * *', { waitForCompletion: true })
  async releaseStaleAcceptedOrders(): Promise<void> {
    try {
      const released = await this.orders.releaseStaleAcceptedOrders();
      if (released > 0) {
        this.logger.log(`Returned ${released} stale order(s) to the board`);
      }
    } catch (error) {
      this.logger.error('Could not process stale accepted orders', error);
    }
  }

  @Cron('*/15 * * * * *', { waitForCompletion: true })
  async announceDueScheduledOrders(): Promise<void> {
    try {
      const announced = await this.orders.announceDueScheduledOrders();
      if (announced > 0) {
        this.logger.log(`Announced ${announced} scheduled order(s)`);
      }
    } catch (error) {
      this.logger.error('Could not announce scheduled orders', error);
    }
  }

  @Cron('*/30 * * * * *', { waitForCompletion: true })
  async sendScheduledReminders(): Promise<void> {
    try {
      const sent = await this.orders.sendScheduledReminders();
      if (sent > 0) {
        this.logger.log(`Queued ${sent} scheduled order reminder(s)`);
      }
    } catch (error) {
      this.logger.error('Could not process scheduled order reminders', error);
    }
  }
}
