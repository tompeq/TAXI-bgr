import 'package:flutter_proj/core/data/local_catalog.dart';
import 'package:flutter_proj/core/models/address_point.dart';
import 'package:flutter_proj/core/models/geo_point.dart';
import 'package:flutter_proj/core/services/service_zone_resolver.dart';
import 'package:flutter_proj/core/services/tariff_calculator.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('keeps the quarry and lower harbor at their configured landmarks', () {
    final lowerHarbor = mapLandmarks.singleWhere(
      (landmark) => landmark.id == 'lower-harbor',
    );
    final quarry = mapLandmarks.singleWhere(
      (landmark) => landmark.id == 'quarry',
    );

    expect(lowerHarbor.coordinates.latitude, 52.43778);
    expect(lowerHarbor.coordinates.longitude, 140.42528);
    expect(quarry.coordinates.latitude, 52.39279);
    expect(quarry.coordinates.longitude, 140.43950);
  });

  test('uses the per-kilometer fallback outside fixed zones', () {
    const outsideZone = AddressPoint(
      id: 'outside-zone',
      title: 'Точка за пределами зон',
      subtitle: 'точка на карте',
      zone: ServiceZone.custom,
      coordinates: GeoPoint(latitude: 52.45, longitude: 140.47),
    );
    final calculation = const TariffCalculator().calculate(
      from: localAddressCatalog.first,
      to: outsideZone,
      createdAt: DateTime(2026, 7, 22, 12),
      tripTime: DateTime(2026, 7, 22, 12),
      scheduled: false,
      roundTrip: false,
      roadSurchargeActive: false,
      routeDistanceMeters: 12100,
    );

    expect(
      ServiceZoneResolver.resolve(outsideZone.coordinates),
      ServiceZone.custom,
    );
    expect(calculation.isDistanceBased, isTrue);
    expect(calculation.distanceRatePerKm, 60);
    expect(calculation.total, 780);
  });
}
