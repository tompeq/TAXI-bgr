import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:yandex_maps_mapkit/directions.dart' as directions;
import 'package:yandex_maps_mapkit/mapkit.dart' as yandex;
import 'package:yandex_maps_mapkit/mapkit_factory.dart' as yandex_factory;
import 'package:yandex_maps_mapkit/yandex_map.dart';
import 'package:yandex_maps_mapkit/ui_view.dart' as yandex_view;

import '../../core/config/app_config.dart';
import '../../core/data/local_catalog.dart';
import '../../core/models/address_point.dart';
import '../../core/models/address_selection.dart';
import '../../core/models/geo_point.dart';
import '../../core/models/route_preview.dart';
import 'mapkit_initializer.dart';
import 'taxi_map_fallback.dart';

class TaxiMap extends StatefulWidget {
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
  State<TaxiMap> createState() => _TaxiMapState();
}

class _TaxiMapState extends State<TaxiMap> with WidgetsBindingObserver {
  yandex.MapWindow? _mapWindow;
  yandex.MapObjectCollection? _landmarkObjects;
  yandex.MapObjectCollection? _routeObjects;
  yandex.MapObjectCollection? _vehicleObjects;
  yandex.PlacemarkMapObject? _vehiclePlacemark;
  yandex.Polyline? _activeRouteGeometry;
  yandex.PolylineIndex? _activeRouteIndex;
  yandex.Point? _displayVehiclePoint;
  double? _displayVehicleHeading;
  yandex.Point? _lastCameraTarget;
  double? _lastCameraAzimuth;
  yandex.UserLocationLayer? _userLocationLayer;
  directions.DrivingRouter? _drivingRouter;
  directions.DrivingSession? _drivingSession;
  directions.DrivingSessionRouteListener? _routeListener;
  Future<void>? _mapkitReady;
  late final yandex.MapCameraListener _cameraListener;
  bool _mapkitStarted = false;
  bool _gestureInProgress = false;
  bool _routeVisible = false;
  int _routeRequest = 0;
  Size _mapSize = Size.zero;

  bool get _canUseMapkit {
    return AppConfig.hasMapkitApiKey &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS);
  }

  AddressPoint? get _focusedAddress {
    return switch (widget.focusSelection ?? widget.activeSelection) {
      AddressSelection.from => widget.from,
      AddressSelection.to => widget.to,
      null => null,
    };
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cameraListener = _TaxiMapCameraListener(
      onChanged: _onCameraPositionChanged,
    );
  }

  @override
  void didUpdateWidget(covariant TaxiMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final active = _focusedAddress;
    final focusRequested = oldWidget.focusRequest != widget.focusRequest;
    final routeRefreshRequested =
        oldWidget.routeRefreshRequest != widget.routeRefreshRequest;
    final endpointsChanged =
        !_samePoint(oldWidget.from, widget.from) ||
        !_samePoint(oldWidget.to, widget.to);
    final destinationChanged = !_samePoint(oldWidget.to, widget.to);
    final hasCompleteRoute = widget.from != null && widget.to != null;
    final vehicleChanged = !_sameGeoPoint(
      oldWidget.vehiclePosition,
      widget.vehiclePosition,
    );
    final userLocationVisibilityChanged =
        oldWidget.showUserLocation != widget.showUserLocation;
    final userLocationFocusRequested =
        oldWidget.userLocationFocusRequest != widget.userLocationFocusRequest;

    if (endpointsChanged || routeRefreshRequested) {
      _syncRoute(
        preserveExisting:
            widget.navigationMode && !destinationChanged && _routeVisible,
      );
    }
    if (vehicleChanged || oldWidget.vehicleHeading != widget.vehicleHeading) {
      _syncVehicleMarker();
    }
    if (vehicleChanged && widget.navigationMode) {
      _followVehicle();
    }
    if (oldWidget.vehicleFocusRequest != widget.vehicleFocusRequest) {
      _followVehicle(force: true);
    }
    if (userLocationVisibilityChanged) {
      _syncUserLocationLayer();
    }
    if (userLocationFocusRequested) {
      _followUserLocation();
    }

    if (focusRequested &&
        active != null &&
        !(endpointsChanged && hasCompleteRoute)) {
      if (widget.activeSelection != null) {
        _beginPointEditing();
      }
      _moveTo(active.coordinates);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_canUseMapkit) {
      return;
    }

    if (state == AppLifecycleState.resumed) {
      _startMapkit();
      _configureMap();
      _syncRoute();
      return;
    }

    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      _stopMapkit();
    }
  }

  @override
  void dispose() {
    final map = _mapWindow?.map;
    if (map != null) {
      map.removeCameraListener(_cameraListener);
    }
    _cancelRouteRequest();
    WidgetsBinding.instance.removeObserver(this);
    _stopMapkit();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_canUseMapkit) {
      return FallbackTaxiMap(
        from: widget.from,
        to: widget.to,
        activeSelection: widget.activeSelection,
        focusRequest: widget.focusRequest,
        onCameraMoveStarted: widget.onCameraMoveStarted,
        onCameraIdle: widget.onCameraIdle,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final nextSize = Size(constraints.maxWidth, constraints.maxHeight);
        if (nextSize != _mapSize) {
          _mapSize = nextSize;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _updateFocusPoint();
          });
        }

        return Stack(
          children: [
            Positioned.fill(
              child: FutureBuilder<void>(
                future: _mapkitReady ??= _prepareMapkit(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done ||
                      snapshot.hasError) {
                    return FallbackTaxiMap(
                      from: widget.from,
                      to: widget.to,
                      activeSelection: widget.activeSelection,
                      focusRequest: widget.focusRequest,
                      onCameraMoveStarted: widget.onCameraMoveStarted,
                      onCameraIdle: widget.onCameraIdle,
                    );
                  }

                  return YandexMap(onMapCreated: _onMapCreated);
                },
              ),
            ),
            if (widget.activeSelection != null && !_routeVisible)
              Positioned(
                left: 0,
                right: 0,
                top: _pinTop,
                child: IgnorePointer(
                  child: _CenterPin(selection: widget.activeSelection!),
                ),
              ),
          ],
        );
      },
    );
  }

  double get _pinTop => (_mapSize.height * 0.5) - 56;

  Future<void> _prepareMapkit() async {
    await MapkitInitializer.ensureInitialized();
    _startMapkit();
  }

  void _startMapkit() {
    if (_mapkitStarted) {
      return;
    }

    yandex_factory.mapkit.onStart();
    _mapkitStarted = true;
  }

  void _stopMapkit() {
    if (!_mapkitStarted) {
      return;
    }

    _cancelRouteRequest();
    yandex_factory.mapkit.onStop();
    _mapkitStarted = false;
  }

  void _onMapCreated(yandex.MapWindow window) {
    _mapWindow = window;
    window.map.addCameraListener(_cameraListener);
    _configureMap();
    _syncRoute();
  }

  void _configureMap() {
    final map = _mapWindow?.map;
    if (map == null) {
      return;
    }

    map.mapType = yandex.MapType.Map;
    map.mode = yandex.MapMode.Map;
    map.nightModeEnabled = false;
    map.poiLimit = 250;
    map.mapObjects.clear();
    _landmarkObjects = map.mapObjects.addCollection();
    _routeObjects = map.mapObjects.addCollection();
    _vehicleObjects = map.mapObjects.addCollection();
    _vehiclePlacemark = null;
    _activeRouteGeometry = null;
    _activeRouteIndex = null;
    _displayVehiclePoint = null;
    _displayVehicleHeading = null;
    _lastCameraTarget = null;
    _lastCameraAzimuth = null;
    _routeVisible = false;
    _syncLandmarks();
    _updateFocusPoint();
    _syncUserLocationLayer();

    final target =
        widget.vehiclePosition ??
        widget.userPosition ??
        _focusedAddress?.coordinates ??
        bogorodskoyeCenter;
    map.move(
      yandex.CameraPosition(
        _point(target),
        zoom: widget.navigationMode ? 17.5 : 16.2,
        azimuth: widget.navigationMode ? widget.vehicleHeading : 0,
        tilt: widget.navigationMode ? 48 : 0,
      ),
    );
    _syncVehicleMarker();
  }

  void _syncLandmarks() {
    final collection = _landmarkObjects;
    if (collection == null) {
      return;
    }
    collection.clear();
    for (final landmark in mapLandmarks) {
      final placemark = collection.addPlacemarkWithView(
        _point(landmark.coordinates),
        yandex_view.ViewProvider(
          id: 'taxi-bgr-landmark-${landmark.id}',
          cacheable: true,
          builder: () => _LandmarkMarker(title: landmark.title),
        ),
      );
      placemark.zIndex = 15;
    }
  }

  void _syncUserLocationLayer() {
    final window = _mapWindow;
    if (window == null) {
      return;
    }

    try {
      final existing = _userLocationLayer;
      final layer = existing != null && existing.isValid()
          ? existing
          : yandex_factory.mapkit.createUserLocationLayer(window);
      _userLocationLayer = layer;
      layer
        ..autoZoomEnabled = false
        ..headingModeActive = false
        ..setVisible(widget.showUserLocation);
    } on Object {
      // Location remains optional; the rest of the map must keep working.
    }
  }

  void _syncRoute({bool preserveExisting = false}) {
    final from = widget.from;
    final to = widget.to;
    if (from == null || to == null) {
      _cancelRouteRequest();
      _clearRouteOverlay();
      _notifyRoute(const RoutePreview.idle());
      return;
    }

    if (_mapWindow == null || !_mapkitStarted) {
      return;
    }

    _cancelRouteRequest();
    final keepCurrentRoute = preserveExisting && _routeVisible;
    if (!keepCurrentRoute) {
      _clearRouteOverlay();
    }
    final request = ++_routeRequest;
    if (!keepCurrentRoute) {
      _notifyRoute(const RoutePreview.loading());
    }

    final listener = directions.DrivingSessionRouteListener(
      onDrivingRoutes: (routes) {
        if (!mounted || request != _routeRequest) {
          return;
        }
        if (routes.isEmpty) {
          _handleRouteUnavailable(keepExisting: keepCurrentRoute);
          return;
        }
        _showRoute(routes.first);
      },
      onDrivingRoutesError: (_) {
        if (!mounted || request != _routeRequest) {
          return;
        }
        _handleRouteUnavailable(keepExisting: keepCurrentRoute);
      },
    );
    _routeListener = listener;

    try {
      _drivingRouter ??= directions.DirectionsFactory.instance
          .createDrivingRouter(directions.DrivingRouterType.Online);
      _drivingSession = _drivingRouter!.requestRoutes(
        const directions.DrivingOptions(routesCount: 1),
        const directions.DrivingVehicleOptions(),
        listener,
        points: [
          yandex.RequestPoint(
            _point(from.coordinates),
            yandex.RequestPointType.Waypoint,
            null,
            null,
            null,
          ),
          yandex.RequestPoint(
            _point(to.coordinates),
            yandex.RequestPointType.Waypoint,
            null,
            null,
            null,
          ),
        ],
      );
    } catch (_) {
      if (request == _routeRequest) {
        _handleRouteUnavailable();
      }
    }
  }

  void _showRoute(directions.DrivingRoute route) {
    final map = _mapWindow?.map;
    if (map == null) {
      return;
    }

    final routeObjects = _routeObjects ??= map.mapObjects.addCollection();
    routeObjects.clear();
    _activeRouteGeometry = route.geometry;
    try {
      _activeRouteIndex = yandex.PolylineUtils.createPolylineIndex(
        route.geometry,
      );
    } on Object {
      _activeRouteIndex = null;
    }
    final polyline = routeObjects.addPolylineWithGeometry(route.geometry)
      ..style = const yandex.LineStyle(
        strokeWidth: 6,
        outlineColor: Colors.white,
        outlineWidth: 2,
        innerOutlineEnabled: true,
        turnRadius: 10,
      );
    polyline.setStrokeColor(const Color(0xFF2B67F6));
    _addRouteEndpointMarkers(routeObjects);

    final weight = route.metadata.weight;
    _notifyRoute(
      RoutePreview.ready(
        distanceMeters: weight.distance.value,
        duration: Duration(seconds: weight.timeWithTraffic.value.ceil()),
      ),
    );

    if (mounted) {
      setState(() => _routeVisible = true);
    } else {
      _routeVisible = true;
    }
    _syncVehicleMarker();
    if (widget.navigationMode && widget.vehiclePosition != null) {
      _followVehicle();
    } else {
      _fitRoute(route.geometry);
    }
  }

  void _addRouteEndpointMarkers(yandex.MapObjectCollection collection) {
    final from = widget.from;
    final to = widget.to;
    if (from == null || to == null) {
      return;
    }

    final startMarker = collection.addPlacemarkWithView(
      _point(from.coordinates),
      yandex_view.ViewProvider(
        id: 'taxi-bgr-route-start',
        cacheable: true,
        builder: () => const _RouteEndpointMarker(isStart: true),
      ),
    );
    startMarker.zIndex = 80;

    final finishMarker = collection.addPlacemarkWithView(
      _point(to.coordinates),
      yandex_view.ViewProvider(
        id: 'taxi-bgr-route-finish',
        cacheable: true,
        builder: () => const _RouteEndpointMarker(isStart: false),
      ),
    );
    finishMarker.zIndex = 80;
  }

  void _syncVehicleMarker() {
    final position = widget.vehiclePosition;
    final collection = _vehicleObjects;
    if (collection == null) {
      return;
    }
    if (position == null) {
      collection.clear();
      _vehiclePlacemark = null;
      _displayVehiclePoint = null;
      _displayVehicleHeading = null;
      return;
    }

    final pose = _vehiclePose(position);
    _displayVehiclePoint = pose.point;
    _displayVehicleHeading = pose.heading;
    final existing = _vehiclePlacemark;
    if (existing != null) {
      existing.geometry = pose.point;
      existing.direction = pose.heading;
      return;
    }

    final placemark = collection.addPlacemarkWithView(
      pose.point,
      yandex_view.ViewProvider(
        id: 'taxi-bgr-driver-marker',
        cacheable: true,
        builder: () => const _VehicleMarker(),
      ),
    );
    placemark
      ..zIndex = 50
      ..direction = pose.heading;
    _vehiclePlacemark = placemark;
  }

  ({yandex.Point point, double heading}) _vehiclePose(GeoPoint position) {
    final rawPoint = _point(position);
    final geometry = _activeRouteGeometry;
    final index = _activeRouteIndex;
    if (!widget.navigationMode || geometry == null || index == null) {
      return (point: rawPoint, heading: widget.vehicleHeading);
    }

    try {
      final routePosition = index.closestPolylinePositionWithPriority(
        rawPoint,
        yandex.PolylineIndexPriority.ClosestToRawPoint,
        maxLocationBias: 65,
      );
      if (routePosition == null) {
        return (point: rawPoint, heading: widget.vehicleHeading);
      }
      final snappedPoint = yandex.PolylineUtils.pointByPolylinePosition(
        geometry,
        routePosition,
      );
      final aheadPosition = yandex.PolylineUtils.advancePolylinePosition(
        geometry,
        routePosition,
        distance: 12,
      );
      final aheadPoint = yandex.PolylineUtils.pointByPolylinePosition(
        geometry,
        aheadPosition,
      );
      final heading = yandex.Geo.distance(snappedPoint, aheadPoint) >= 1
          ? yandex.Geo.course(snappedPoint, aheadPoint)
          : widget.vehicleHeading;
      return (point: snappedPoint, heading: heading);
    } on Object {
      return (point: rawPoint, heading: widget.vehicleHeading);
    }
  }

  void _followVehicle({bool force = false}) {
    final window = _mapWindow;
    final position = widget.vehiclePosition;
    if (window == null || position == null) {
      return;
    }
    final target = _displayVehiclePoint ?? _vehiclePose(position).point;
    final heading = _displayVehicleHeading ?? widget.vehicleHeading;
    final previousTarget = _lastCameraTarget;
    final previousAzimuth = _lastCameraAzimuth;
    if (!force &&
        previousTarget != null &&
        previousAzimuth != null &&
        yandex.Geo.distance(previousTarget, target) < 1.5 &&
        _headingDifference(previousAzimuth, heading) < 3) {
      return;
    }
    _lastCameraTarget = target;
    _lastCameraAzimuth = heading;
    final current = window.map.cameraPosition;
    window.map.move(
      yandex.CameraPosition(
        target,
        zoom: current.zoom < 17 ? 17.5 : current.zoom,
        azimuth: heading > 0 ? heading : current.azimuth,
        tilt: widget.navigationMode ? 48 : current.tilt,
      ),
      animation: const yandex.Animation(
        type: yandex.AnimationType.Smooth,
        duration: 0.7,
      ),
    );
  }

  double _headingDifference(double first, double second) {
    return (((second - first + 540) % 360) - 180).abs();
  }

  void _followUserLocation() {
    final window = _mapWindow;
    final position = widget.userPosition;
    if (window == null || position == null) {
      return;
    }

    final current = window.map.cameraPosition;
    window.map.move(
      yandex.CameraPosition(
        _point(position),
        zoom: current.zoom < 16 ? 16.2 : current.zoom,
        azimuth: 0,
        tilt: 0,
      ),
      animation: const yandex.Animation(
        type: yandex.AnimationType.Smooth,
        duration: 0.4,
      ),
    );
  }

  void _fitRoute(yandex.Polyline geometry) {
    final window = _mapWindow;
    if (window == null) {
      return;
    }

    final width = window.width();
    final height = window.height();
    if (width <= 0 || height <= 0) {
      return;
    }

    final bottom = (height * 0.41).clamp(230.0, height - 24).toDouble();
    final focusRect = yandex.ScreenRect(
      const yandex.ScreenPoint(x: 28, y: 118),
      yandex.ScreenPoint(x: width - 28, y: bottom),
    );
    final cameraPosition = window.map.cameraPositionForGeometry(
      yandex.Geometry.fromPolyline(geometry),
      focusRect: focusRect,
      azimuth: 0,
      tilt: 0,
    );
    window.map.move(
      cameraPosition,
      animation: const yandex.Animation(
        type: yandex.AnimationType.Smooth,
        duration: 0.55,
      ),
    );
  }

  void _handleRouteUnavailable({bool keepExisting = false}) {
    _cancelRouteRequest();
    if (keepExisting && _routeVisible) {
      return;
    }
    _clearRouteOverlay();
    _notifyRoute(const RoutePreview.unavailable());
  }

  void _beginPointEditing() {
    _cancelRouteRequest();
    _clearRouteOverlay();
  }

  void _cancelRouteRequest() {
    _routeRequest++;
    if (_routeListener != null) {
      _drivingSession?.cancel();
    }
    _drivingSession = null;
    _routeListener = null;
  }

  void _clearRouteOverlay() {
    _routeObjects?.clear();
    _activeRouteGeometry = null;
    _activeRouteIndex = null;
    if (widget.vehiclePosition != null) {
      _syncVehicleMarker();
    }
    if (!_routeVisible) {
      return;
    }

    if (mounted) {
      setState(() => _routeVisible = false);
    } else {
      _routeVisible = false;
    }
  }

  void _notifyRoute(RoutePreview preview) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        widget.onRouteChanged(preview);
      }
    });
  }

  void _updateFocusPoint() {
    final window = _mapWindow;
    if (window == null) {
      return;
    }
    final width = window.width();
    final height = window.height();
    if (width <= 0 || height <= 0) {
      return;
    }
    window.focusPoint = yandex.ScreenPoint(
      x: width / 2,
      y: height * (widget.navigationMode ? 0.68 : 0.5),
    );
  }

  void _moveTo(GeoPoint point) {
    final window = _mapWindow;
    if (window == null) {
      return;
    }
    final map = window.map;
    final target = _point(point);
    final targetOnScreen = window.worldToScreen(target);
    if (targetOnScreen != null) {
      final horizontalOffset = (targetOnScreen.x - window.width() / 2).abs();
      final verticalOffset = (targetOnScreen.y - window.height() * 0.5).abs();
      if (horizontalOffset < 8 && verticalOffset < 8) {
        return;
      }
    }
    map.move(
      yandex.CameraPosition(
        target,
        zoom: map.cameraPosition.zoom < 16 ? 16.2 : map.cameraPosition.zoom,
        azimuth: 0,
        tilt: 0,
      ),
      animation: const yandex.Animation(
        type: yandex.AnimationType.Smooth,
        duration: 0.55,
      ),
    );
  }

  void _onCameraPositionChanged(
    yandex.CameraPosition _,
    yandex.CameraUpdateReason reason,
    bool finished,
  ) {
    if (widget.activeSelection == null || _routeVisible) {
      return;
    }

    if (reason == yandex.CameraUpdateReason.Gestures &&
        !_gestureInProgress &&
        !finished) {
      _gestureInProgress = true;
      widget.onCameraMoveStarted();
    }

    if (!finished) {
      return;
    }

    _gestureInProgress = false;
    if (reason != yandex.CameraUpdateReason.Gestures) {
      return;
    }
    final window = _mapWindow;
    if (window == null) {
      return;
    }
    final pointUnderPin = window.screenToWorld(
      yandex.ScreenPoint(x: window.width() / 2, y: window.height() * 0.5),
    );
    if (pointUnderPin == null) {
      return;
    }
    widget.onCameraIdle(
      GeoPoint(
        latitude: pointUnderPin.latitude,
        longitude: pointUnderPin.longitude,
      ),
    );
  }

  yandex.Point _point(GeoPoint point) {
    return yandex.Point(latitude: point.latitude, longitude: point.longitude);
  }

  bool _samePoint(AddressPoint? first, AddressPoint? second) {
    if (identical(first, second)) {
      return true;
    }
    if (first == null || second == null) {
      return false;
    }
    return first.coordinates.latitude == second.coordinates.latitude &&
        first.coordinates.longitude == second.coordinates.longitude;
  }

  bool _sameGeoPoint(GeoPoint? first, GeoPoint? second) {
    if (identical(first, second)) {
      return true;
    }
    if (first == null || second == null) {
      return false;
    }
    return first.latitude == second.latitude &&
        first.longitude == second.longitude;
  }
}

class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F1F),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 4),
        boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 8)],
      ),
      child: const Icon(
        Icons.navigation_rounded,
        size: 23,
        color: Color(0xFFFFCC00),
      ),
    );
  }
}

class _TaxiMapCameraListener implements yandex.MapCameraListener {
  const _TaxiMapCameraListener({required this.onChanged});

  final void Function(
    yandex.CameraPosition position,
    yandex.CameraUpdateReason reason,
    bool finished,
  )
  onChanged;

  @override
  void onCameraPositionChanged(
    yandex.Map map,
    yandex.CameraPosition cameraPosition,
    yandex.CameraUpdateReason cameraUpdateReason,
    bool finished,
  ) {
    onChanged(cameraPosition, cameraUpdateReason, finished);
  }
}

class _CenterPin extends StatelessWidget {
  const _CenterPin({required this.selection});

  final AddressSelection selection;

  @override
  Widget build(BuildContext context) {
    final isFrom = selection == AddressSelection.from;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: isFrom ? const Color(0xFF1F1F1F) : const Color(0xFFFFCC00),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 4),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x33000000),
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Icon(
              isFrom ? Icons.my_location : Icons.flag,
              color: isFrom ? Colors.white : const Color(0xFF1F1F1F),
              size: 22,
            ),
          ),
          Container(width: 3, height: 12, color: const Color(0xFF1F1F1F)),
          Container(
            width: 8,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0x55000000),
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteEndpointMarker extends StatelessWidget {
  const _RouteEndpointMarker({required this.isStart});

  final bool isStart;

  @override
  Widget build(BuildContext context) {
    final color = isStart ? const Color(0xFF2B67F6) : const Color(0xFF1F1F1F);
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 3),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Icon(
        isStart ? Icons.trip_origin : Icons.flag,
        color: color,
        size: isStart ? 18 : 19,
      ),
    );
  }
}

class _LandmarkMarker extends StatelessWidget {
  const _LandmarkMarker({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xFF1F1F1F),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: const [
              BoxShadow(
                color: Color(0x33000000),
                blurRadius: 6,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: const Padding(
            padding: EdgeInsets.all(7),
            child: Icon(Icons.location_on, color: Color(0xFFFFCC00), size: 18),
          ),
        ),
        const SizedBox(height: 3),
        DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(5),
            boxShadow: const [
              BoxShadow(color: Color(0x22000000), blurRadius: 4),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xFF1F1F1F),
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
