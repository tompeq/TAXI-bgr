import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderKind } from './order-kind.enum';
import { OrderPricingMode } from './order-pricing-mode.enum';
import { ServiceZoneCode } from './service-zone-code.enum';
import { TariffPeriod } from './tariff-period.enum';
import { TariffSettingEntity } from './tariff-setting.entity';
import { ServiceSettingsService } from '../service-settings/service-settings.service';
import { SurveysService } from '../surveys/surveys.service';
import { RoadConditionArea } from '../surveys/road-condition-state.entity';
import { ServiceZonesService } from '../service-zones/service-zones.service';

interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface FareQuote {
  settingId: string;
  settingVersion: number;
  pickupZone: ServiceZoneCode;
  destinationZone: ServiceZoneCode;
  period: TariffPeriod;
  pricingMode: OrderPricingMode;
  fareAmount: number;
  roadSurchargeAmount: number;
  routeDistanceMeters: number | null;
  distanceRatePerKm: number | null;
}

@Injectable()
export class TariffService {
  private readonly businessTimeZone: string;

  constructor(
    config: ConfigService,
    @InjectRepository(TariffSettingEntity)
    private readonly settings: Repository<TariffSettingEntity>,
    private readonly serviceSettings: ServiceSettingsService,
    private readonly surveys: SurveysService,
    private readonly zones: ServiceZonesService,
  ) {
    this.businessTimeZone = config.getOrThrow<string>('BUSINESS_TIME_ZONE');
  }

  async quote(input: {
    kind: OrderKind;
    pickup: Coordinates;
    destination: Coordinates;
    basisTime: Date;
    roundTrip: boolean;
    routeDistanceMeters?: number;
  }): Promise<FareQuote> {
    if (this.distanceMeters(input.pickup, input.destination) < 10) {
      throw new BadRequestException({
        code: 'ORDER_POINTS_TOO_CLOSE',
        message: 'Pickup and destination must be different',
      });
    }

    const [resolvedPickupZone, resolvedDestinationZone] = await Promise.all([
      this.zones.resolveOrNull(input.pickup.latitude, input.pickup.longitude),
      this.zones.resolveOrNull(
        input.destination.latitude,
        input.destination.longitude,
      ),
    ]);
    const pickupZone = resolvedPickupZone ?? ServiceZoneCode.Custom;
    const destinationZone = resolvedDestinationZone ?? ServiceZoneCode.Custom;
    const pricingMode =
      pickupZone === ServiceZoneCode.Custom ||
      destinationZone === ServiceZoneCode.Custom
        ? OrderPricingMode.Distance
        : OrderPricingMode.Fixed;
    const billingZone =
      pricingMode === OrderPricingMode.Distance
        ? ServiceZoneCode.Custom
        : this.dominantZone(pickupZone, destinationZone);
    const period = this.resolvePeriod(input.basisTime);
    const setting = await this.settings.findOneBy({
      kind: input.kind,
      zone: billingZone,
    });
    if (!setting) {
      throw new ServiceUnavailableException({
        code: 'TARIFF_NOT_CONFIGURED',
        message: 'Tariff is not configured for this route',
      });
    }

    const oneWayFare = this.fareForPeriod(setting, period);
    if (pricingMode === OrderPricingMode.Distance) {
      const routeDistanceMeters = this.billedDistanceMeters(
        input.pickup,
        input.destination,
        input.routeDistanceMeters,
      );
      const billedKilometers = Math.max(
        1,
        Math.ceil(routeDistanceMeters / 1000),
      );
      return {
        settingId: setting.id,
        settingVersion: setting.version,
        pickupZone,
        destinationZone,
        period,
        pricingMode,
        fareAmount: billedKilometers * oneWayFare * (input.roundTrip ? 2 : 1),
        roadSurchargeAmount: 0,
        routeDistanceMeters,
        distanceRatePerKm: oneWayFare,
      };
    }

    const routeFare = oneWayFare * (input.roundTrip ? 2 : 1);
    const roadArea =
      billingZone === ServiceZoneCode.LowerHarbor ||
      billingZone === ServiceZoneCode.Quarry
        ? RoadConditionArea.Harbor
        : RoadConditionArea.Bgr;
    const roadSurchargeActive =
      period === TariffPeriod.Day &&
      (await this.surveys.roadSurchargeActive(roadArea));
    const serviceSettings = roadSurchargeActive
      ? await this.serviceSettings.get()
      : null;
    const roadSurchargeAmount = serviceSettings
      ? Math.round((routeFare * serviceSettings.roadSurchargePercent) / 100)
      : 0;
    return {
      settingId: setting.id,
      settingVersion: setting.version,
      pickupZone,
      destinationZone,
      period,
      pricingMode,
      fareAmount: routeFare + roadSurchargeAmount,
      roadSurchargeAmount,
      routeDistanceMeters: null,
      distanceRatePerKm: null,
    };
  }

  private dominantZone(
    pickup: ServiceZoneCode,
    destination: ServiceZoneCode,
  ): ServiceZoneCode {
    const zones = new Set([pickup, destination]);
    if (zones.has(ServiceZoneCode.LowerHarbor)) {
      return ServiceZoneCode.LowerHarbor;
    }
    if (zones.has(ServiceZoneCode.Quarry)) {
      return ServiceZoneCode.Quarry;
    }
    if (zones.has(ServiceZoneCode.Kombinat)) {
      return ServiceZoneCode.Kombinat;
    }
    return ServiceZoneCode.UpperBgr;
  }

  private billedDistanceMeters(
    pickup: Coordinates,
    destination: Coordinates,
    routeDistanceMeters?: number,
  ): number {
    const directDistanceMeters = this.distanceMeters(pickup, destination);
    if (
      routeDistanceMeters === undefined ||
      !Number.isFinite(routeDistanceMeters)
    ) {
      return Math.ceil(directDistanceMeters);
    }
    const submittedDistanceMeters = Math.round(routeDistanceMeters);
    const maximumReasonableDistance = Math.ceil(
      Math.max(5000, directDistanceMeters * 4),
    );
    return Math.max(
      Math.ceil(directDistanceMeters),
      Math.min(submittedDistanceMeters, maximumReasonableDistance),
    );
  }

  private resolvePeriod(time: Date): TariffPeriod {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: this.businessTimeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(time)
      .find((part) => part.type === 'hour');
    const hour = Number(hourPart?.value);
    if (!Number.isInteger(hour)) {
      throw new Error('Unable to resolve business time');
    }
    if (hour >= 21 || hour < 6) {
      return TariffPeriod.Night;
    }
    if (hour >= 19) {
      return TariffPeriod.Evening;
    }
    return TariffPeriod.Day;
  }

  private fareForPeriod(
    setting: TariffSettingEntity,
    period: TariffPeriod,
  ): number {
    switch (period) {
      case TariffPeriod.Day:
        return setting.dayFare;
      case TariffPeriod.Evening:
        return setting.eveningFare;
      case TariffPeriod.Night:
        return setting.nightFare;
    }
  }

  private distanceMeters(first: Coordinates, second: Coordinates): number {
    const earthRadius = 6_371_000;
    const firstLatitude = this.radians(first.latitude);
    const secondLatitude = this.radians(second.latitude);
    const latitudeDelta = secondLatitude - firstLatitude;
    const longitudeDelta = this.radians(second.longitude - first.longitude);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private radians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
