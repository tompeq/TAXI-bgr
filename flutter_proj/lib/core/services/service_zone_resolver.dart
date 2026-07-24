import 'dart:math' as math;

import '../data/local_catalog.dart';
import '../models/address_point.dart';
import '../models/geo_point.dart';

class ServiceZoneResolver {
  const ServiceZoneResolver._();

  static const _upperBgrRadiusMeters = 3500.0;
  static const _specialZoneRadiusMeters = 1200.0;

  static ServiceZone resolve(GeoPoint point, {String address = ''}) {
    final normalized = address.toLowerCase();
    if (normalized.contains('карьер')) {
      return ServiceZone.quarry;
    }
    if (normalized.contains('гаван')) {
      return ServiceZone.lowerHarbor;
    }
    if (normalized.contains('комбинат')) {
      return ServiceZone.kombinat;
    }

    final specialZones = mapLandmarks;
    AddressPoint? nearest;
    var nearestDistance = double.infinity;

    for (final zone in specialZones) {
      final distance = _distanceMeters(point, zone.coordinates);
      if (distance < nearestDistance) {
        nearest = zone;
        nearestDistance = distance;
      }
    }

    if (nearest != null && nearestDistance <= _specialZoneRadiusMeters) {
      return nearest.zone;
    }
    return _distanceMeters(point, bogorodskoyeCenter) <= _upperBgrRadiusMeters
        ? ServiceZone.upperBgr
        : ServiceZone.custom;
  }

  static double _distanceMeters(GeoPoint first, GeoPoint second) {
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

  static double _radians(double degrees) => degrees * math.pi / 180;
}
