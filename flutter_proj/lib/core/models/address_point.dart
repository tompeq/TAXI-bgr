import 'geo_point.dart';

enum ServiceZone { upperBgr, kombinat, lowerHarbor, quarry, custom }

extension ServiceZoneText on ServiceZone {
  String get title {
    return switch (this) {
      ServiceZone.upperBgr => 'Верхний БГР',
      ServiceZone.kombinat => 'Комбинат',
      ServiceZone.lowerHarbor => 'Нижняя Гавань',
      ServiceZone.quarry => 'Карьер',
      ServiceZone.custom => 'По километражу',
    };
  }
}

class AddressPoint {
  const AddressPoint({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.zone,
    required this.coordinates,
  });

  final String id;
  final String title;
  final String subtitle;
  final ServiceZone zone;
  final GeoPoint coordinates;
}
