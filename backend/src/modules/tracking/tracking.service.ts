import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { OrdersService } from '../orders/orders.service';
import { UserRole } from '../users/user-role.enum';

export interface DriverLocationInput {
  orderId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speedMps?: number;
  accuracyMeters?: number;
  etaSeconds?: number;
}

export interface DriverLocationSnapshot extends DriverLocationInput {
  driverUserId: string;
  recordedAt: string;
}

const LOCATION_TTL_SECONDS = 30;

@Injectable()
export class TrackingService {
  constructor(
    private readonly redis: RedisService,
    private readonly orders: OrdersService,
  ) {}

  async joinOrder(
    orderId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DriverLocationSnapshot | null> {
    this.assertOrderId(orderId);
    await this.orders.assertTrackingAccess(orderId, currentUser);
    const value = await this.redis.connection.get(this.locationKey(orderId));
    return value ? (JSON.parse(value) as DriverLocationSnapshot) : null;
  }

  async publishDriverLocation(
    input: DriverLocationInput,
    currentUser: AuthenticatedUser,
  ): Promise<DriverLocationSnapshot> {
    if (currentUser.role !== UserRole.Driver) {
      throw new ForbiddenException({
        code: 'DRIVER_ROLE_REQUIRED',
        message: 'Only the assigned driver can publish location',
      });
    }
    this.validateLocation(input);
    await this.orders.assertTrackingAccess(input.orderId, currentUser);
    if (input.etaSeconds != null) {
      await this.orders.markArrivalSoon(
        input.orderId,
        currentUser,
        input.etaSeconds,
      );
    }

    const snapshot: DriverLocationSnapshot = {
      orderId: input.orderId,
      driverUserId: currentUser.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speedMps: input.speedMps,
      accuracyMeters: input.accuracyMeters,
      recordedAt: new Date().toISOString(),
    };
    await this.redis.connection.set(
      this.locationKey(input.orderId),
      JSON.stringify(snapshot),
      'EX',
      LOCATION_TTL_SECONDS,
    );
    return snapshot;
  }

  private validateLocation(input: DriverLocationInput): void {
    this.assertOrderId(input.orderId);
    if (
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90 ||
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'Location coordinates are invalid',
      });
    }
  }

  private assertOrderId(orderId: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderId)) {
      throw new BadRequestException({
        code: 'ORDER_ID_INVALID',
        message: 'Order id is invalid',
      });
    }
  }

  private locationKey(orderId: string): string {
    return `tracking:order:${orderId}:driver`;
  }
}
