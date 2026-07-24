import '../models/geo_point.dart';

class VehicleLocation {
  const VehicleLocation({
    required this.point,
    required this.recordedAt,
    this.heading = 0,
    this.speedMps = 0,
    this.accuracyMeters = 0,
  });

  final GeoPoint point;
  final DateTime recordedAt;
  final double heading;
  final double speedMps;
  final double accuracyMeters;

  factory VehicleLocation.fromJson(Map<String, dynamic> json) {
    return VehicleLocation(
      point: GeoPoint(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      ),
      recordedAt: DateTime.parse(json['recordedAt'] as String).toLocal(),
      heading: (json['heading'] as num?)?.toDouble() ?? 0,
      speedMps: (json['speedMps'] as num?)?.toDouble() ?? 0,
      accuracyMeters: (json['accuracyMeters'] as num?)?.toDouble() ?? 0,
    );
  }

  Map<String, dynamic> toJson(String orderId, {int? etaSeconds}) {
    return {
      'orderId': orderId,
      'latitude': point.latitude,
      'longitude': point.longitude,
      'heading': heading,
      'speedMps': speedMps,
      'accuracyMeters': accuracyMeters,
      'etaSeconds': ?etaSeconds,
    };
  }
}
