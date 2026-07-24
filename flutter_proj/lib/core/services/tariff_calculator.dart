import 'dart:math' as math;

import '../models/address_point.dart';
import '../models/geo_point.dart';

enum TariffPeriod { day, evening, night }

extension TariffPeriodText on TariffPeriod {
  String get title {
    return switch (this) {
      TariffPeriod.day => 'Дневной',
      TariffPeriod.evening => 'Вечерний',
      TariffPeriod.night => 'Ночной',
    };
  }
}

class TariffBreakdown {
  const TariffBreakdown({
    required this.baseFare,
    required this.periodFare,
    required this.waitingFare,
    required this.roadSurcharge,
    required this.roundTrip,
    required this.total,
    required this.period,
    this.isDistanceBased = false,
    this.distanceRatePerKm,
    this.routeDistanceMeters,
  });

  final int baseFare;
  final int periodFare;
  final int waitingFare;
  final int roadSurcharge;
  final bool roundTrip;
  final int total;
  final TariffPeriod period;
  final bool isDistanceBased;
  final int? distanceRatePerKm;
  final double? routeDistanceMeters;
}

class TariffCalculator {
  const TariffCalculator();

  TariffBreakdown calculate({
    required AddressPoint from,
    required AddressPoint to,
    required DateTime createdAt,
    required DateTime tripTime,
    required bool scheduled,
    required bool roundTrip,
    required bool roadSurchargeActive,
    int waitingMinutes = 0,
    double? routeDistanceMeters,
    int distanceRatePerKm = 60,
    bool forceDistanceBased = false,
  }) {
    final basisTime = scheduled ? tripTime : createdAt;
    final period = _periodFor(basisTime);
    final isDistanceBased =
        forceDistanceBased ||
        from.zone == ServiceZone.custom ||
        to.zone == ServiceZone.custom;
    if (isDistanceBased) {
      final distanceMeters =
          routeDistanceMeters ??
          _distanceMeters(from.coordinates, to.coordinates);
      final billedKilometers = (distanceMeters / 1000)
          .ceil()
          .clamp(1, 1000)
          .toInt();
      final routeFare =
          billedKilometers * distanceRatePerKm * (roundTrip ? 2 : 1);
      final paidWaitingMinutes = waitingMinutes > 10 ? waitingMinutes - 10 : 0;
      final waitingFare = paidWaitingMinutes * 10;
      return TariffBreakdown(
        baseFare: distanceRatePerKm,
        periodFare: routeFare,
        waitingFare: waitingFare,
        roadSurcharge: 0,
        roundTrip: roundTrip,
        total: routeFare + waitingFare,
        period: period,
        isDistanceBased: true,
        distanceRatePerKm: distanceRatePerKm,
        routeDistanceMeters: distanceMeters,
      );
    }
    final zone = _dominantZone(from.zone, to.zone);
    final baseFare = _baseFare(zone);
    final periodFare = switch (period) {
      TariffPeriod.day => baseFare,
      TariffPeriod.evening => baseFare + _eveningExtra(zone),
      TariffPeriod.night => _nightFare(zone),
    };

    final routeFare = periodFare * (roundTrip ? 2 : 1);
    final canApplyRoadSurcharge =
        roadSurchargeActive && period == TariffPeriod.day;
    final roadSurcharge = canApplyRoadSurcharge ? (routeFare * 0.2).round() : 0;
    final paidWaitingMinutes = waitingMinutes > 10 ? waitingMinutes - 10 : 0;
    final waitingFare = paidWaitingMinutes * 10;

    return TariffBreakdown(
      baseFare: baseFare,
      periodFare: periodFare,
      waitingFare: waitingFare,
      roadSurcharge: roadSurcharge,
      roundTrip: roundTrip,
      total: routeFare + roadSurcharge + waitingFare,
      period: period,
    );
  }

  ServiceZone _dominantZone(ServiceZone from, ServiceZone to) {
    final zones = {from, to};
    if (zones.contains(ServiceZone.lowerHarbor)) {
      return ServiceZone.lowerHarbor;
    }
    if (zones.contains(ServiceZone.quarry)) {
      return ServiceZone.quarry;
    }
    if (zones.contains(ServiceZone.kombinat)) {
      return ServiceZone.kombinat;
    }
    return ServiceZone.upperBgr;
  }

  int _baseFare(ServiceZone zone) {
    return switch (zone) {
      ServiceZone.upperBgr => 200,
      ServiceZone.kombinat => 250,
      ServiceZone.lowerHarbor => 700,
      ServiceZone.quarry => 500,
      ServiceZone.custom => 0,
    };
  }

  int _eveningExtra(ServiceZone zone) {
    return switch (zone) {
      ServiceZone.upperBgr => 50,
      ServiceZone.kombinat => 50,
      ServiceZone.lowerHarbor => 200,
      ServiceZone.quarry => 150,
      ServiceZone.custom => 0,
    };
  }

  int _nightFare(ServiceZone zone) {
    return switch (zone) {
      ServiceZone.upperBgr => 400,
      ServiceZone.kombinat => 500,
      ServiceZone.lowerHarbor => 1500,
      ServiceZone.quarry => 1000,
      ServiceZone.custom => 0,
    };
  }

  TariffPeriod _periodFor(DateTime time) {
    if (time.hour >= 21 || time.hour < 6) {
      return TariffPeriod.night;
    }
    if (time.hour >= 19 && time.hour < 21) {
      return TariffPeriod.evening;
    }
    return TariffPeriod.day;
  }

  double _distanceMeters(GeoPoint first, GeoPoint second) {
    const earthRadius = 6371000.0;
    final firstLatitude = _radians(first.latitude);
    final secondLatitude = _radians(second.latitude);
    final latitudeDelta = secondLatitude - firstLatitude;
    final longitudeDelta = _radians(second.longitude - first.longitude);
    final a =
        math.sin(latitudeDelta / 2) * math.sin(latitudeDelta / 2) +
        math.cos(firstLatitude) *
            math.cos(secondLatitude) *
            math.sin(longitudeDelta / 2) *
            math.sin(longitudeDelta / 2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  double _radians(double degrees) => degrees * math.pi / 180;
}
