import 'package:flutter/material.dart';

import '../../core/models/address_point.dart';
import '../../core/models/address_selection.dart';
import '../../core/models/geo_point.dart';
import '../../core/models/route_preview.dart';

class TaxiMap extends StatelessWidget {
  const TaxiMap({
    required this.from,
    required this.to,
    required this.activeSelection,
    this.focusSelection,
    required this.focusRequest,
    this.routeRefreshRequest = 0,
    required this.onCameraMoveStarted,
    required this.onCameraIdle,
    required this.onRouteChanged,
    this.vehiclePosition,
    this.vehicleHeading = 0,
    this.userPosition,
    this.showUserLocation = false,
    this.userLocationFocusRequest = 0,
    this.navigationMode = false,
    this.vehicleFocusRequest = 0,
    super.key,
  });

  final AddressPoint? from;
  final AddressPoint? to;
  final AddressSelection? activeSelection;
  final AddressSelection? focusSelection;
  final int focusRequest;
  final int routeRefreshRequest;
  final VoidCallback onCameraMoveStarted;
  final ValueChanged<GeoPoint> onCameraIdle;
  final ValueChanged<RoutePreview> onRouteChanged;
  final GeoPoint? vehiclePosition;
  final double vehicleHeading;
  final GeoPoint? userPosition;
  final bool showUserLocation;
  final int userLocationFocusRequest;
  final bool navigationMode;
  final int vehicleFocusRequest;

  @override
  Widget build(BuildContext context) {
    return FallbackTaxiMap(
      from: from,
      to: to,
      activeSelection: activeSelection,
      focusSelection: focusSelection,
      focusRequest: focusRequest,
      onCameraMoveStarted: onCameraMoveStarted,
      onCameraIdle: onCameraIdle,
      vehiclePosition: vehiclePosition,
    );
  }
}

class FallbackTaxiMap extends StatelessWidget {
  const FallbackTaxiMap({
    required this.from,
    required this.to,
    required this.activeSelection,
    this.focusSelection,
    required this.focusRequest,
    required this.onCameraMoveStarted,
    required this.onCameraIdle,
    this.vehiclePosition,
    super.key,
  });

  final AddressPoint? from;
  final AddressPoint? to;
  final AddressSelection? activeSelection;
  final AddressSelection? focusSelection;
  final int focusRequest;
  final VoidCallback onCameraMoveStarted;
  final ValueChanged<GeoPoint> onCameraIdle;
  final GeoPoint? vehiclePosition;

  @override
  Widget build(BuildContext context) {
    final pinSelection = activeSelection ?? focusSelection;
    return Stack(
      children: [
        const Positioned.fill(
          child: CustomPaint(painter: _BogorodskoyeMapPainter()),
        ),
        if (pinSelection != null)
          Positioned(
            top: MediaQuery.sizeOf(context).height * 0.24,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Center(
                child: Icon(
                  pinSelection == AddressSelection.from
                      ? Icons.my_location
                      : Icons.location_on,
                  size: 42,
                  color: pinSelection == AddressSelection.from
                      ? const Color(0xFF1F1F1F)
                      : const Color(0xFFFFCC00),
                ),
              ),
            ),
          ),
        if (vehiclePosition != null)
          const Center(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Color(0xFF1F1F1F),
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: EdgeInsets.all(10),
                child: Icon(Icons.navigation_rounded, color: Color(0xFFFFCC00)),
              ),
            ),
          ),
      ],
    );
  }
}

class _BogorodskoyeMapPainter extends CustomPainter {
  const _BogorodskoyeMapPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFFE9E4D6),
    );

    final water = Paint()..color = const Color(0xFFB9D7E8);
    final waterPath = Path()
      ..moveTo(size.width * 0.73, 0)
      ..cubicTo(
        size.width * 0.66,
        size.height * 0.28,
        size.width * 0.84,
        size.height * 0.55,
        size.width * 0.72,
        size.height,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(size.width, 0)
      ..close();
    canvas.drawPath(waterPath, water);

    final roadEdge = Paint()
      ..color = const Color(0xFFD7D0BD)
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final road = Paint()
      ..color = Colors.white
      ..strokeWidth = 15
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final roads = [
      [
        Offset(size.width * 0.04, size.height * 0.15),
        Offset(size.width * 0.42, size.height * 0.38),
        Offset(size.width * 0.75, size.height * 0.62),
      ],
      [
        Offset(size.width * 0.02, size.height * 0.62),
        Offset(size.width * 0.35, size.height * 0.46),
        Offset(size.width * 0.82, size.height * 0.25),
      ],
      [
        Offset(size.width * 0.28, 0),
        Offset(size.width * 0.35, size.height * 0.42),
        Offset(size.width * 0.42, size.height),
      ],
    ];
    for (final points in roads) {
      final path = Path()..moveTo(points.first.dx, points.first.dy);
      for (final point in points.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      canvas.drawPath(path, roadEdge);
      canvas.drawPath(path, road);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
