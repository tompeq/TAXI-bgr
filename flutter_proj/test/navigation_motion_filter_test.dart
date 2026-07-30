import 'package:flutter_proj/core/models/geo_point.dart';
import 'package:flutter_proj/core/tracking/navigation_motion_filter.dart';
import 'package:flutter_proj/core/tracking/vehicle_location.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('keeps the previous heading while the vehicle is stationary', () {
    final filter = NavigationMotionFilter();
    final now = DateTime(2026);

    expect(filter.apply(_location(now, heading: 25)).heading, 25);
    expect(
      filter
          .apply(
            _location(
              now.add(const Duration(seconds: 3)),
              heading: 220,
              latitude: 52.3661001,
            ),
          )
          .heading,
      25,
    );
  });

  test('uses movement direction and smooths a real turn', () {
    final filter = NavigationMotionFilter();
    final now = DateTime(2026);
    filter.apply(_location(now, heading: 0, speedMps: 4));

    final eastbound = filter.apply(
      _location(
        now.add(const Duration(seconds: 3)),
        longitude: 140.436,
        heading: 270,
        speedMps: 4,
      ),
    );

    expect(eastbound.heading, closeTo(49.5, 3));
  });

  test('takes the short path across north', () {
    final filter = NavigationMotionFilter();
    final now = DateTime(2026);
    filter.apply(_location(now, heading: 350, speedMps: 2));

    final next = filter.apply(
      _location(now.add(const Duration(seconds: 3)), heading: 10, speedMps: 2),
    );

    expect(next.heading, anyOf(greaterThan(350), lessThan(5)));
  });
}

VehicleLocation _location(
  DateTime recordedAt, {
  double latitude = 52.3661,
  double longitude = 140.4358,
  double heading = 0,
  double speedMps = 0,
}) {
  return VehicleLocation(
    point: GeoPoint(latitude: latitude, longitude: longitude),
    recordedAt: recordedAt,
    heading: heading,
    speedMps: speedMps,
    accuracyMeters: 10,
  );
}
