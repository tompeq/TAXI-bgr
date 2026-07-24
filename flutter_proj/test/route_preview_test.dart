import 'package:flutter_proj/core/models/route_preview.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('formats short route distance and rounds duration up', () {
    const preview = RoutePreview.ready(
      distanceMeters: 842,
      duration: Duration(minutes: 7, seconds: 1),
    );

    expect(preview.distanceText, '850 м');
    expect(preview.durationText, '8 мин');
  });

  test('formats kilometer distance and duration over an hour', () {
    const preview = RoutePreview.ready(
      distanceMeters: 1250,
      duration: Duration(minutes: 65),
    );

    expect(preview.distanceText, '1,3 км');
    expect(preview.durationText, '1 ч 5 мин');
  });
}
