import 'dart:io';

import 'package:geolocator/geolocator.dart';

import '../models/geo_point.dart';
import 'vehicle_location.dart';

class LocationPermissionException implements Exception {
  const LocationPermissionException(
    this.message, {
    this.permanentlyDenied = false,
    this.locationServiceDisabled = false,
  });

  final String message;
  final bool permanentlyDenied;
  final bool locationServiceDisabled;
}

class DeviceLocationService {
  const DeviceLocationService();

  Future<bool> openAppSettings() => Geolocator.openAppSettings();

  Future<bool> openLocationSettings() => Geolocator.openLocationSettings();

  Future<VehicleLocation> current() async {
    await _ensureAvailable();
    final settings = Platform.isAndroid
        ? AndroidSettings(
            accuracy: LocationAccuracy.bestForNavigation,
            timeLimit: const Duration(seconds: 10),
          )
        : const LocationSettings(
            accuracy: LocationAccuracy.bestForNavigation,
            timeLimit: Duration(seconds: 10),
          );
    final position = await Geolocator.getCurrentPosition(
      locationSettings: settings,
    );
    return _toVehicleLocation(position);
  }

  /// A lightweight stream for showing the person's position on the map.
  /// It deliberately does not start a foreground service or show a persistent
  /// notification.
  Future<Stream<VehicleLocation>> watchForMap() {
    final LocationSettings settings = Platform.isAndroid
        ? AndroidSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 8,
            intervalDuration: const Duration(seconds: 5),
          )
        : const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 8,
          );
    return _watch(settings);
  }

  /// Starts navigation-grade tracking for a driver during a shift.
  Future<Stream<VehicleLocation>> watch() {
    final LocationSettings settings = Platform.isAndroid
        ? AndroidSettings(
            accuracy: LocationAccuracy.bestForNavigation,
            distanceFilter: 5,
            intervalDuration: const Duration(seconds: 5),
            foregroundNotificationConfig: const ForegroundNotificationConfig(
              notificationTitle: 'Такси Бгр',
              notificationText: 'Передаём геолокацию для активной поездки',
              notificationChannelName: 'Геолокация водителя',
              enableWakeLock: true,
              setOngoing: true,
            ),
          )
        : const LocationSettings(
            accuracy: LocationAccuracy.bestForNavigation,
            distanceFilter: 5,
          );
    return _watch(settings);
  }

  Future<Stream<VehicleLocation>> _watch(LocationSettings settings) async {
    await _ensureAvailable();
    return Geolocator.getPositionStream(
      locationSettings: settings,
    ).map(_toVehicleLocation);
  }

  Future<void> _ensureAvailable() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw LocationPermissionException(
        'Разрешите приложению доступ к геопозиции',
        permanentlyDenied: permission == LocationPermission.deniedForever,
      );
    }

    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationPermissionException(
        'Включите геолокацию на устройстве',
        locationServiceDisabled: true,
      );
    }
  }

  VehicleLocation _toVehicleLocation(Position position) {
    return VehicleLocation(
      point: GeoPoint(
        latitude: position.latitude,
        longitude: position.longitude,
      ),
      heading: position.heading.isFinite ? position.heading : 0,
      speedMps: position.speed.isFinite && position.speed > 0
          ? position.speed
          : 0,
      accuracyMeters: position.accuracy,
      recordedAt: position.timestamp,
    );
  }
}
