import 'dart:math' as math;

import '../models/geo_point.dart';
import 'vehicle_location.dart';

class NavigationMotionFilter {
  VehicleLocation? _previousRaw;
  double? _displayHeading;

  VehicleLocation apply(VehicleLocation current) {
    final previous = _previousRaw;
    _previousRaw = current;

    final movedMeters = previous == null
        ? 0.0
        : _distanceMeters(previous.point, current.point);
    final moving = current.speedMps >= 1.2 || movedMeters >= 4;
    final gpsHeading = _normalizeHeading(current.heading);
    var candidate = gpsHeading;

    if (previous != null && movedMeters >= 4) {
      candidate = _bearing(previous.point, current.point);
    }

    final previousHeading = _displayHeading;
    if (previousHeading == null) {
      _displayHeading = candidate;
    } else if (moving) {
      final delta = _shortestHeadingDelta(previousHeading, candidate);
      _displayHeading = _normalizeHeading(previousHeading + delta * 0.55);
    }

    return VehicleLocation(
      point: current.point,
      recordedAt: current.recordedAt,
      heading: _displayHeading ?? candidate,
      speedMps: current.speedMps,
      accuracyMeters: current.accuracyMeters,
    );
  }

  double _distanceMeters(GeoPoint first, GeoPoint second) {
    const earthRadiusMeters = 6371000.0;
    final latitudeDelta = _radians(second.latitude - first.latitude);
    final longitudeDelta = _radians(second.longitude - first.longitude);
    final startLatitude = _radians(first.latitude);
    final endLatitude = _radians(second.latitude);
    final haversine =
        math.sin(latitudeDelta / 2) * math.sin(latitudeDelta / 2) +
        math.cos(startLatitude) *
            math.cos(endLatitude) *
            math.sin(longitudeDelta / 2) *
            math.sin(longitudeDelta / 2);
    return earthRadiusMeters *
        2 *
        math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine));
  }

  double _bearing(GeoPoint first, GeoPoint second) {
    final firstLatitude = _radians(first.latitude);
    final secondLatitude = _radians(second.latitude);
    final longitudeDelta = _radians(second.longitude - first.longitude);
    final y = math.sin(longitudeDelta) * math.cos(secondLatitude);
    final x =
        math.cos(firstLatitude) * math.sin(secondLatitude) -
        math.sin(firstLatitude) *
            math.cos(secondLatitude) *
            math.cos(longitudeDelta);
    return _normalizeHeading(math.atan2(y, x) * 180 / math.pi);
  }

  double _shortestHeadingDelta(double from, double to) {
    return ((to - from + 540) % 360) - 180;
  }

  double _normalizeHeading(double value) {
    if (!value.isFinite) {
      return 0;
    }
    return (value % 360 + 360) % 360;
  }

  double _radians(double degrees) => degrees * math.pi / 180;
}
