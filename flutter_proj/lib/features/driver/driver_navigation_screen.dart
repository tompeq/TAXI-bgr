import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/data/local_catalog.dart';
import '../../core/driver_work/driver_work_models.dart';
import '../../core/engagement/engagement_store.dart';
import '../../core/finance/finance_models.dart';
import '../../core/models/address_point.dart';
import '../../core/models/geo_point.dart';
import '../../core/models/route_preview.dart';
import '../../core/models/taxi_order.dart';
import '../../core/orders/order_store.dart';
import '../../core/support/support_store.dart';
import '../../core/tracking/device_location_service.dart';
import '../../core/tracking/tracking_client.dart';
import '../../core/tracking/vehicle_location.dart';
import '../map/taxi_map.dart';
import '../support/support_chat_sheet.dart';
import '../engagement/engagement_dialogs.dart';
import '../engagement/order_chat_sheet.dart';

class DriverHomeScreen extends StatefulWidget {
  const DriverHomeScreen({
    required this.orderStore,
    required this.supportStore,
    required this.engagementStore,
    this.trackingClient,
    this.orderEvents,
    this.onSwitchToPassenger,
    this.onLogout,
    super.key,
  });

  final OrderStore orderStore;
  final SupportStore supportStore;
  final EngagementStore engagementStore;
  final TrackingClient? trackingClient;
  final Stream<String>? orderEvents;
  final Future<void> Function()? onSwitchToPassenger;
  final Future<void> Function()? onLogout;

  @override
  State<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends State<DriverHomeScreen>
    with WidgetsBindingObserver {
  static const _locationService = DeviceLocationService();
  static const _preferences = FlutterSecureStorage();

  Timer? _boardTimer;
  StreamSubscription<VehicleLocation>? _locationSubscription;
  StreamSubscription<String>? _orderEventSubscription;
  VehicleLocation? _vehicleLocation;
  GeoPoint? _routeOrigin;
  DateTime? _lastRouteOriginUpdate;
  RoutePreview _routePreview = const RoutePreview.idle();
  String? _locationError;
  bool _locationNeedsAppSettings = false;
  bool _locationNeedsDeviceSettings = false;
  String? _trackedOrderId;
  int _vehicleFocusRequest = 0;
  bool _startingLocation = false;
  bool _surveyOpen = false;
  bool _statusUpdateInFlight = false;
  bool _compactBoard = true;
  bool _engagementDialogOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.orderStore.addListener(_onStoreChanged);
    widget.trackingClient?.addListener(_onTrackingChanged);
    _orderEventSubscription = widget.orderEvents?.listen((event) {
      if ((event == 'new_order' || event == 'scheduled_order_reminder') &&
          widget.orderStore.driverWorkState?.status ==
              DriverLineStatus.online) {
        unawaited(_refreshBoard());
      }
    });
    unawaited(_loadBoardPreference());
    unawaited(_loadDriverState());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_showPendingEngagement());
    });
  }

  @override
  void dispose() {
    widget.orderStore.removeListener(_onStoreChanged);
    WidgetsBinding.instance.removeObserver(this);
    widget.trackingClient?.removeListener(_onTrackingChanged);
    _boardTimer?.cancel();
    _locationSubscription?.cancel();
    _orderEventSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.orderStore;
    final workState = store.driverWorkState;
    final activeOrder = store.activeDriverOrder;
    final location = _effectiveLocation(store);
    final destination = activeOrder == null
        ? null
        : _navigationDestination(activeOrder);
    final routeOrigin = location == null
        ? null
        : AddressPoint(
            id: 'driver-position',
            title: 'Моё местоположение',
            subtitle: '',
            zone: ServiceZone.upperBgr,
            coordinates: _routeOrigin ?? location.point,
          );

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: AnimatedBuilder(
        animation: Listenable.merge([
          store,
          if (widget.trackingClient != null) widget.trackingClient!,
        ]),
        builder: (context, _) {
          return Stack(
            children: [
              Positioned.fill(
                child: TaxiMap(
                  from: activeOrder == null ? null : routeOrigin,
                  to: destination,
                  activeSelection: null,
                  focusRequest: 0,
                  vehiclePosition: location?.point,
                  vehicleHeading: location?.heading ?? 0,
                  vehicleFocusRequest: _vehicleFocusRequest,
                  navigationMode: activeOrder != null,
                  onCameraMoveStarted: () {},
                  onCameraIdle: (_) {},
                  onRouteChanged: _onRouteChanged,
                ),
              ),
              _TopBar(
                workState: workState,
                earnings: store.driverEarnings24h,
                onMenu: _showDriverMenu,
              ),
              Positioned(
                right: 14,
                top: MediaQuery.paddingOf(context).top + 76,
                child: _MapActionButton(
                  icon: Icons.my_location,
                  tooltip: 'Моё местоположение',
                  onPressed: () {
                    if (_vehicleLocation == null) {
                      unawaited(_ensureLocationTracking());
                    }
                    setState(() => _vehicleFocusRequest++);
                  },
                ),
              ),
              if (activeOrder != null)
                _NavigationHeader(
                  order: activeOrder,
                  destination: destination!,
                  routePreview: _routePreview,
                ),
              if (_locationError != null)
                Positioned(
                  left: 14,
                  right: 70,
                  top: MediaQuery.paddingOf(context).top + 78,
                  child: _LocationNotice(
                    message: _locationError!,
                    actionLabel: _locationNeedsDeviceSettings
                        ? 'Включить'
                        : 'Настройки',
                    onTap: () => unawaited(_handleLocationNoticeTap()),
                  ),
                ),
              if (activeOrder != null)
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _ActiveOrderPanel(
                    order: activeOrder,
                    nextOrder: store.scheduledDriverOrders
                        .where((order) => !order.scheduled)
                        .firstOrNull,
                    routePreview: _routePreview,
                    loading: store.loading,
                    onPrimaryAction: () => _advanceOrder(activeOrder),
                    onWaiting: activeOrder.status == OrderStatus.arrived
                        ? () => _updateOrderStatus(OrderStatus.waiting)
                        : null,
                    onCancel: () => _showCancelSheet(activeOrder),
                    onChat: () => _showOrderChat(activeOrder),
                    onUpcomingOrders: store.openOrders.isEmpty
                        ? null
                        : () => _showUpcomingOrders(activeOrder),
                  ),
                )
              else if (workState?.status == DriverLineStatus.online)
                _OrderBoardSheet(
                  orders: store.openOrders,
                  reservations: store.scheduledDriverOrders,
                  announcement: store.boardAnnouncement,
                  loading: store.loading,
                  compact: _compactBoard,
                  acceptingBlocked: store.hasImminentReservation,
                  visibilityDelaySeconds:
                      workState?.visibilityDelaySeconds ?? 0,
                  onRefresh: _refreshBoard,
                  onAccept: _acceptOrder,
                  onCompactChanged: _setCompactBoard,
                )
              else
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _OfflinePanel(
                    workState: workState,
                    loading: store.loading,
                    onStart: () => _setWorking(true),
                    onResume: _resumeShift,
                  ),
                ),
              if (store.loading && workState == null)
                const Positioned.fill(
                  child: ColoredBox(
                    color: Color(0x66FFFFFF),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  VehicleLocation? _effectiveLocation(OrderStore store) {
    if (_vehicleLocation != null) {
      return _vehicleLocation;
    }
    if (!store.isLocalDevelopment) {
      return null;
    }
    return VehicleLocation(
      point: bogorodskoyeCenter,
      recordedAt: DateTime.now(),
    );
  }

  AddressPoint _navigationDestination(TaxiOrder order) {
    return switch (order.status) {
      OrderStatus.accepted || OrderStatus.driverEnRoute => order.from,
      _ => order.to,
    };
  }

  void _onStoreChanged() {
    final activeOrder = widget.orderStore.activeDriverOrder;
    if (activeOrder?.id != _trackedOrderId) {
      unawaited(_syncTracking(activeOrder));
    }
    // The map and panels capture order data in the parent build. Rebuild it
    // when the store changes so a status update reaches the visible controls.
    if (mounted) {
      setState(() {});
    }
  }

  void _onTrackingChanged() {
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _syncTracking(TaxiOrder? order) async {
    _trackedOrderId = order?.id;
    if (order == null) {
      widget.trackingClient?.clearOrder();
      return;
    }
    await _ensureLocationTracking();
    await widget.trackingClient?.connectToOrder(order.id);
  }

  Future<void> _ensureLocationTracking() async {
    if (_locationSubscription != null || _startingLocation) {
      return;
    }
    _startingLocation = true;
    try {
      final stream = await _locationService.watch();
      _locationSubscription = stream.listen(
        _onVehicleLocation,
        onError: (Object _) {
          _locationSubscription?.cancel();
          _locationSubscription = null;
          if (mounted) {
            setState(() {
              _locationError = 'Не удаётся получить геопозицию';
              _locationNeedsAppSettings = false;
              _locationNeedsDeviceSettings = true;
            });
          }
        },
      );
      if (mounted) {
        setState(() {
          _locationError = null;
          _locationNeedsAppSettings = false;
          _locationNeedsDeviceSettings = false;
        });
      }
    } on LocationPermissionException catch (error) {
      if (mounted) {
        setState(() {
          _locationError = error.message;
          _locationNeedsAppSettings = !error.locationServiceDisabled;
          _locationNeedsDeviceSettings = error.locationServiceDisabled;
        });
      }
    } finally {
      _startingLocation = false;
    }
  }

  void _onVehicleLocation(VehicleLocation location) {
    final now = DateTime.now();
    final shouldUpdateRoute =
        _routeOrigin == null ||
        _lastRouteOriginUpdate == null ||
        now.difference(_lastRouteOriginUpdate!) >= const Duration(seconds: 15);
    if (mounted) {
      setState(() {
        _vehicleLocation = location;
        _locationError = null;
        _locationNeedsAppSettings = false;
        _locationNeedsDeviceSettings = false;
        if (shouldUpdateRoute) {
          _routeOrigin = location.point;
          _lastRouteOriginUpdate = now;
        }
      });
    }
    if (widget.orderStore.activeDriverOrder != null &&
        location.accuracyMeters <= 100) {
      final active = widget.orderStore.activeDriverOrder;
      final headingToPickup =
          active?.status == OrderStatus.accepted ||
          active?.status == OrderStatus.driverEnRoute;
      widget.trackingClient?.publishDriverLocation(
        location,
        etaSeconds: headingToPickup ? _routePreview.duration?.inSeconds : null,
      );
    }
  }

  Future<void> _handleLocationNoticeTap() async {
    try {
      final opened = _locationNeedsDeviceSettings
          ? await _locationService.openLocationSettings()
          : await _locationService.openAppSettings();
      if (!opened) {
        throw StateError('Settings screen was not opened');
      }
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось открыть настройки')),
        );
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed ||
        (!_locationNeedsAppSettings && !_locationNeedsDeviceSettings)) {
      return;
    }
    setState(() {
      _locationNeedsAppSettings = false;
      _locationNeedsDeviceSettings = false;
    });
    _locationSubscription?.cancel();
    _locationSubscription = null;
    unawaited(_ensureLocationTracking());
  }

  void _onRouteChanged(RoutePreview preview) {
    if (!mounted) {
      return;
    }
    setState(() => _routePreview = preview);
  }

  Future<void> _loadDriverState() async {
    try {
      await widget.orderStore.loadDriverState();
      _syncBoardTimer();
      final state = widget.orderStore.driverWorkState;
      if (state?.isWorking ?? false) {
        await _ensureLocationTracking();
      }
      await _syncTracking(widget.orderStore.activeDriverOrder);
      await widget.orderStore.loadDueDriverSurveys();
      unawaited(_showDueSurvey());
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _setWorking(bool value) async {
    try {
      if (value) {
        await widget.orderStore.startDriverShift();
        await _ensureLocationTracking();
      } else {
        await widget.orderStore.endDriverShift();
      }
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _refreshBoard() async {
    try {
      await widget.orderStore.refreshBoard();
    } on Object {
      _showStoreError();
    }
  }

  void _syncBoardTimer() {
    _boardTimer?.cancel();
    if (widget.orderStore.driverWorkState?.status != DriverLineStatus.online) {
      return;
    }
    _boardTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => unawaited(widget.orderStore.refreshBoard().catchError((_) {})),
    );
  }

  Future<void> _acceptOrder(String orderId) async {
    try {
      await widget.orderStore.acceptOrder(orderId);
      await _syncTracking(widget.orderStore.activeDriverOrder);
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _advanceOrder(TaxiOrder order) async {
    final next = switch (order.status) {
      OrderStatus.accepted => OrderStatus.driverEnRoute,
      OrderStatus.driverEnRoute => OrderStatus.arrived,
      OrderStatus.arrived || OrderStatus.waiting => OrderStatus.started,
      OrderStatus.started => OrderStatus.completed,
      _ => null,
    };
    if (next != null) {
      await _updateOrderStatus(next);
    }
  }

  Future<void> _updateOrderStatus(OrderStatus status) async {
    if (_statusUpdateInFlight) {
      return;
    }
    _statusUpdateInFlight = true;
    try {
      await widget.orderStore.updateActiveStatus(status);
      if (status == OrderStatus.completed) {
        widget.trackingClient?.clearOrder();
        _trackedOrderId = null;
        await widget.orderStore.loadDueDriverSurveys();
        unawaited(_showDueSurvey());
        unawaited(_showPendingEngagement());
      }
    } on Object {
      _showStoreError();
    } finally {
      _statusUpdateInFlight = false;
    }
  }

  Future<void> _showDueSurvey() async {
    if (!mounted || _surveyOpen || widget.orderStore.dueDriverSurveys.isEmpty) {
      return;
    }
    _surveyOpen = true;
    final survey = widget.orderStore.dueDriverSurveys.first;
    final result = await showModalBottomSheet<_SurveySubmission>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _DriverSurveySheet(survey: survey),
    );
    _surveyOpen = false;
    if (result == null) {
      return;
    }
    try {
      await widget.orderStore.submitDriverSurvey(
        survey,
        result.answer,
        suggestion: result.suggestion,
      );
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _resumeShift() async {
    try {
      await widget.orderStore.resumeDriverShift();
      _syncBoardTimer();
    } on Object {
      _showStoreError();
    }
  }

  void _showStoreError() {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          widget.orderStore.errorMessage ?? 'Не удалось выполнить действие',
        ),
      ),
    );
  }

  Future<void> _loadBoardPreference() async {
    final value = await _preferences.read(key: 'driver_compact_board');
    if (mounted && value != null) {
      setState(() => _compactBoard = value != 'false');
    }
  }

  Future<void> _setCompactBoard(bool value) async {
    setState(() => _compactBoard = value);
    await _preferences.write(
      key: 'driver_compact_board',
      value: value.toString(),
    );
  }

  Future<void> _showPendingEngagement() async {
    if (!mounted || _engagementDialogOpen) return;
    _engagementDialogOpen = true;
    try {
      await showPendingEngagementDialogs(context, widget.engagementStore);
    } finally {
      _engagementDialogOpen = false;
    }
  }

  void _showOrderChat(TaxiOrder order) {
    final userId = widget.engagementStore.auth.session?.user.id;
    if (userId == null) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => OrderChatSheet(
        store: widget.engagementStore,
        orderId: order.id,
        currentUserId: userId,
      ),
    );
  }

  void _showUpcomingOrders(TaxiOrder activeOrder) {
    final orders = widget.orderStore.openOrders;
    final nextOrderAlreadyReserved = widget.orderStore.scheduledDriverOrders
        .any((order) => !order.scheduled);
    final canReserveNext = _canReserveNextOrder(activeOrder.status);
    final nearestId = canReserveNext && !nextOrderAlreadyReserved
        ? _nearestOrderId(activeOrder, orders)
        : null;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.68,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const Text(
                'Заказы после текущего',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 6),
              Text(
                nextOrderAlreadyReserved
                    ? 'Один следующий заказ уже выбран. После завершения '
                          'текущей поездки он откроется автоматически.'
                    : canReserveNext
                    ? 'Значком отмечен единственный заказ, который можно '
                          'взять следующим.'
                    : 'Следующий заказ можно выбрать после начала выполнения '
                          'текущего.',
                style: TextStyle(color: Color(0xFF666666)),
              ),
              const SizedBox(height: 12),
              ...orders.map(
                (order) => Padding(
                  padding: const EdgeInsets.only(bottom: 7),
                  child: _BoardOrderTile(
                    order: order,
                    compact: _compactBoard,
                    nearest: order.id == nearestId,
                    onAccept:
                        (order.scheduled &&
                                order.tripTime.difference(DateTime.now()) >
                                    const Duration(minutes: 30)) ||
                            (!order.scheduled && order.id == nearestId)
                        ? () {
                            Navigator.of(context).pop();
                            unawaited(_acceptOrder(order.id));
                          }
                        : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _nearestOrderId(TaxiOrder activeOrder, List<TaxiOrder> orders) {
    String? nearestId;
    var nearestDistance = double.infinity;
    for (final order in orders) {
      if (order.scheduled) continue;
      final distance = _distanceMeters(
        activeOrder.to.coordinates,
        order.from.coordinates,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = order.id;
      }
    }
    return nearestId;
  }

  bool _canReserveNextOrder(OrderStatus status) {
    return status == OrderStatus.driverEnRoute ||
        status == OrderStatus.arrived ||
        status == OrderStatus.waiting ||
        status == OrderStatus.started;
  }

  double _distanceMeters(GeoPoint from, GeoPoint to) {
    const radius = 6371000.0;
    final latitudeDelta = (to.latitude - from.latitude) * math.pi / 180;
    final longitudeDelta = (to.longitude - from.longitude) * math.pi / 180;
    final fromLatitude = from.latitude * math.pi / 180;
    final toLatitude = to.latitude * math.pi / 180;
    final a =
        math.sin(latitudeDelta / 2) * math.sin(latitudeDelta / 2) +
        math.cos(fromLatitude) *
            math.cos(toLatitude) *
            math.sin(longitudeDelta / 2) *
            math.sin(longitudeDelta / 2);
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  Future<void> _showDriverMenu() async {
    final workState = widget.orderStore.driverWorkState;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _DriverMenuSheet(
        workState: workState,
        debt: widget.orderStore.driverDebt,
        earnings: widget.orderStore.driverEarnings24h,
        paymentDetails: widget.orderStore.driverPaymentDetails,
        reservations: widget.orderStore.scheduledDriverOrders,
        onSettingsChanged: _updateSettings,
        onPaymentDetailsChanged: _updatePaymentDetails,
        onBreak: _startBreak,
        onEndShift: () async {
          Navigator.of(context).pop();
          await _setWorking(false);
        },
        onSupportChat: _showSupportChat,
        onSwitchToPassenger: widget.onSwitchToPassenger,
        onLogout: widget.onLogout,
      ),
    );
  }

  void _showSupportChat() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          SupportChatSheet(store: widget.supportStore, title: 'Чат с админом'),
    );
  }

  Future<void> _updateSettings({
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  }) async {
    try {
      await widget.orderStore.updateDriverSettings(
        acceptsTaxi: acceptsTaxi,
        acceptsDelivery: acceptsDelivery,
        backgroundNotifications: backgroundNotifications,
        nightNotifications: nightNotifications,
      );
    } on Object {
      _showStoreError();
    }
  }

  Future<DriverPaymentDetails> _updatePaymentDetails({
    required String transferPhone,
    required String transferBank,
  }) async {
    try {
      return await widget.orderStore.updateDriverPaymentDetails(
        transferPhone: transferPhone,
        transferBank: transferBank,
      );
    } on Object {
      _showStoreError();
      rethrow;
    }
  }

  Future<void> _startBreak(int minutes) async {
    try {
      await widget.orderStore.startDriverBreak(minutes);
      _syncBoardTimer();
      if (mounted) {
        Navigator.of(context).pop();
      }
    } on Object {
      _showStoreError();
    }
  }

  Future<void> _showCancelSheet(TaxiOrder order) async {
    const reasons = [
      (code: 'passenger_no_show', label: 'Пассажир не вышел'),
      (code: 'passenger_no_answer', label: 'Пассажир не отвечает'),
      (code: 'passenger_aggressive', label: 'Пассажир ведёт себя неадекватно'),
      (
        code: 'passenger_count_mismatch',
        label: 'Число пассажиров не соответствует заявке',
      ),
      (
        code: 'passenger_over_capacity',
        label: 'Пассажиров больше посадочных мест',
      ),
      (
        code: 'passenger_payment_refused',
        label: 'Пассажир отказался оплатить заранее',
      ),
    ];
    final reason = await showModalBottomSheet<({String code, String label})>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            const Text(
              'Причина отмены',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            ...reasons.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.label),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).pop(item),
              ),
            ),
          ],
        ),
      ),
    );
    if (reason == null) {
      return;
    }
    try {
      await widget.orderStore.cancelActiveOrder(
        reason.label,
        reasonCode: reason.code,
      );
      widget.trackingClient?.clearOrder();
      _trackedOrderId = null;
    } on Object {
      _showStoreError();
    }
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.workState,
    required this.earnings,
    required this.onMenu,
  });

  final DriverWorkState? workState;
  final double earnings;
  final VoidCallback onMenu;

  @override
  Widget build(BuildContext context) {
    final online = workState?.status == DriverLineStatus.online;
    final onBreak = workState?.status == DriverLineStatus.onBreak;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
        child: Row(
          children: [
            _MapActionButton(
              icon: Icons.menu,
              tooltip: 'Меню',
              onPressed: onMenu,
            ),
            const SizedBox(width: 10),
            _StatusPill(
              color: online
                  ? const Color(0xFF19A463)
                  : onBreak
                  ? const Color(0xFFF29F05)
                  : const Color(0xFF8A8A8A),
              text: online
                  ? 'На линии'
                  : onBreak
                  ? 'Перерыв'
                  : 'Не на линии',
            ),
            const Spacer(),
            _StatusPill(
              color: const Color(0xFFFFCC00),
              text: '${earnings.toStringAsFixed(0)} ₽',
              darkText: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _MapActionButton extends StatelessWidget {
  const _MapActionButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 4,
      shadowColor: const Color(0x22000000),
      borderRadius: BorderRadius.circular(24),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.color,
    required this.text,
    this.darkText = false,
  });

  final Color color;
  final String text;
  final bool darkText;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 12)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            text,
            style: TextStyle(
              color: darkText ? const Color(0xFF1F1F1F) : null,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _NavigationHeader extends StatelessWidget {
  const _NavigationHeader({
    required this.order,
    required this.destination,
    required this.routePreview,
  });

  final TaxiOrder order;
  final AddressPoint destination;
  final RoutePreview routePreview;

  @override
  Widget build(BuildContext context) {
    final toPickup =
        order.status == OrderStatus.accepted ||
        order.status == OrderStatus.driverEnRoute;
    return Positioned(
      left: 14,
      right: 70,
      top: MediaQuery.paddingOf(context).top + 76,
      child: Material(
        color: const Color(0xFF1F1F1F),
        elevation: 5,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.turn_right, color: Color(0xFFFFCC00), size: 34),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      toPickup ? 'К месту подачи' : 'К месту назначения',
                      style: const TextStyle(color: Color(0xFFBDBDBD)),
                    ),
                    Text(
                      destination.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              if (routePreview.status == RoutePreviewStatus.ready)
                Text(
                  routePreview.durationText,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LocationNotice extends StatelessWidget {
  const _LocationNotice({
    required this.message,
    required this.actionLabel,
    required this.onTap,
  });

  final String message;
  final String actionLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFFFF1D7),
      borderRadius: BorderRadius.circular(8),
      elevation: 3,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              const Icon(Icons.location_disabled, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(message)),
              const SizedBox(width: 8),
              Text(
                actionLabel,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const Icon(Icons.chevron_right, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfflinePanel extends StatelessWidget {
  const _OfflinePanel({
    required this.workState,
    required this.loading,
    required this.onStart,
    required this.onResume,
  });

  final DriverWorkState? workState;
  final bool loading;
  final VoidCallback onStart;
  final VoidCallback onResume;

  @override
  Widget build(BuildContext context) {
    final onBreak = workState?.status == DriverLineStatus.onBreak;
    return Material(
      color: Colors.white,
      elevation: 12,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                onBreak ? 'Вы на перерыве' : 'Готовы принимать заказы?',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                onBreak
                    ? 'Вернитесь на линию, когда будете готовы.'
                    : 'После выхода на линию откроется доска заказов.',
                style: const TextStyle(color: Color(0xFF707070)),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  onPressed: loading ? null : (onBreak ? onResume : onStart),
                  icon: Icon(onBreak ? Icons.play_arrow : Icons.local_taxi),
                  label: Text(onBreak ? 'Продолжить работу' : 'РАБОТАТЬ'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderBoardSheet extends StatelessWidget {
  const _OrderBoardSheet({
    required this.orders,
    required this.reservations,
    required this.announcement,
    required this.loading,
    required this.compact,
    required this.acceptingBlocked,
    required this.visibilityDelaySeconds,
    required this.onRefresh,
    required this.onAccept,
    required this.onCompactChanged,
  });

  final List<TaxiOrder> orders;
  final List<TaxiOrder> reservations;
  final String announcement;
  final bool loading;
  final bool compact;
  final bool acceptingBlocked;
  final int visibilityDelaySeconds;
  final Future<void> Function() onRefresh;
  final ValueChanged<String> onAccept;
  final ValueChanged<bool> onCompactChanged;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.50,
      minChildSize: 0.20,
      maxChildSize: 0.78,
      builder: (context, controller) => Material(
        color: Colors.white,
        elevation: 12,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
        child: RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD0D0D0),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Заказы рядом',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: compact
                        ? 'Большие карточки'
                        : 'Компактные карточки',
                    onPressed: () => onCompactChanged(!compact),
                    icon: Icon(
                      compact ? Icons.view_agenda_outlined : Icons.view_list,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Обновить',
                    onPressed: loading ? null : onRefresh,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              if (visibilityDelaySeconds > 0)
                Text(
                  'Новые заказы появятся через $visibilityDelaySeconds сек.',
                  style: const TextStyle(color: Color(0xFF777777)),
                ),
              if (reservations.isNotEmpty) ...[
                const SizedBox(height: 10),
                _ReservationSummary(orders: reservations),
              ],
              if (acceptingBlocked) ...[
                const SizedBox(height: 8),
                const Text(
                  'До заказа на время осталось меньше 5 минут. '
                  'Новые заказы временно недоступны.',
                  style: TextStyle(
                    color: Color(0xFF9A5B00),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              if (announcement.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 11,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF5C4),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.campaign_outlined, size: 19),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          announcement,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 8),
              if (orders.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 36),
                  child: Column(
                    children: [
                      Icon(Icons.wifi_tethering, size: 36),
                      SizedBox(height: 10),
                      Text('Ждём новые заказы'),
                    ],
                  ),
                )
              else
                ...orders.map(
                  (order) => Padding(
                    padding: const EdgeInsets.only(bottom: 7),
                    child: _BoardOrderTile(
                      order: order,
                      compact: compact,
                      nearest: false,
                      onAccept: acceptingBlocked
                          ? null
                          : () => onAccept(order.id),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BoardOrderTile extends StatelessWidget {
  const _BoardOrderTile({
    required this.order,
    required this.compact,
    required this.nearest,
    required this.onAccept,
  });

  final TaxiOrder order;
  final bool compact;
  final bool nearest;
  final VoidCallback? onAccept;

  @override
  Widget build(BuildContext context) {
    final delivery = order.kind == RideKind.delivery;
    final accent = delivery ? const Color(0xFF1E9E63) : const Color(0xFFE34B43);
    return Material(
      color: const Color(0xFFF7F7F4),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onAccept,
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: 11,
            vertical: compact ? 7 : 11,
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Container(width: 4, height: 24, color: accent),
                  const SizedBox(width: 8),
                  Icon(
                    delivery ? Icons.inventory_2 : Icons.local_taxi,
                    size: 19,
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      order.kind.title,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (nearest) ...[
                    const Icon(
                      Icons.near_me,
                      size: 18,
                      color: Color(0xFF1769AA),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    '${order.fare} ₽',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 7),
              _AddressRow(
                icon: Icons.radio_button_checked,
                text: order.from.title,
              ),
              const SizedBox(height: 4),
              _AddressRow(icon: Icons.location_on, text: order.to.title),
              if (!compact) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      order.scheduled ? Icons.schedule : Icons.people_outline,
                      size: 16,
                      color: const Color(0xFF666666),
                    ),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        order.scheduled
                            ? _formatScheduledOrderTime(order.tripTime)
                            : '${order.passengers} пасс. · ${order.paymentMethod.title}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF666666),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ReservationSummary extends StatelessWidget {
  const _ReservationSummary({required this.orders});

  final List<TaxiOrder> orders;

  @override
  Widget build(BuildContext context) {
    final first = orders.first;
    final queuedNext = !first.scheduled;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF4FF),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFFB7D8F5)),
      ),
      child: Row(
        children: [
          const Icon(Icons.event_available_outlined, size: 21),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  queuedNext
                      ? orders.length == 1
                            ? 'Следующий заказ выбран'
                            : 'Следующий заказ выбран · ещё ${orders.length - 1}'
                      : orders.length == 1
                      ? 'Заказ на время'
                      : 'Заказов на время: ${orders.length}',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  queuedNext
                      ? '${first.from.title} → ${first.to.title}'
                      : '${_formatScheduledOrderTime(first.tripTime)} · '
                            '${first.from.title}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _formatScheduledOrderTime(DateTime time) {
  final now = DateTime.now();
  final day = DateUtils.isSameDay(now, time)
      ? 'Сегодня'
      : '${time.day.toString().padLeft(2, '0')}.'
            '${time.month.toString().padLeft(2, '0')}';
  return '$day в ${time.hour.toString().padLeft(2, '0')}:'
      '${time.minute.toString().padLeft(2, '0')}';
}

class _AddressRow extends StatelessWidget {
  const _AddressRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 17, color: const Color(0xFF666666)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

class _ActiveOrderPanel extends StatelessWidget {
  const _ActiveOrderPanel({
    required this.order,
    required this.nextOrder,
    required this.routePreview,
    required this.loading,
    required this.onPrimaryAction,
    required this.onWaiting,
    required this.onCancel,
    required this.onChat,
    required this.onUpcomingOrders,
  });

  final TaxiOrder order;
  final TaxiOrder? nextOrder;
  final RoutePreview routePreview;
  final bool loading;
  final VoidCallback onPrimaryAction;
  final VoidCallback? onWaiting;
  final VoidCallback onCancel;
  final VoidCallback onChat;
  final VoidCallback? onUpcomingOrders;

  @override
  Widget build(BuildContext context) {
    final (title, icon) = switch (order.status) {
      OrderStatus.accepted => ('В путь к пассажиру', Icons.navigation),
      OrderStatus.driverEnRoute => ('Я на месте', Icons.location_on),
      OrderStatus.arrived ||
      OrderStatus.waiting => ('Начать поездку', Icons.play_arrow),
      OrderStatus.started => ('Завершить поездку', Icons.check),
      _ => ('Продолжить', Icons.arrow_forward),
    };
    return Material(
      color: Colors.white,
      elevation: 14,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          order.passengerName ??
                              (order.kind == RideKind.delivery
                                  ? 'Доставка'
                                  : 'Пассажир'),
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          '${order.fare} ₽ · ${order.paymentMethod.title}',
                          style: const TextStyle(color: Color(0xFF666666)),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Чат с пассажиром',
                    onPressed: onChat,
                    icon: const Icon(Icons.chat_bubble_outline),
                  ),
                  IconButton(
                    tooltip: 'Отменить заказ',
                    onPressed: onCancel,
                    icon: const Icon(Icons.more_horiz),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              if (order.status == OrderStatus.waiting) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF5C4),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Ожидание: ${order.waitingCharge} ₽. '
                    'Первые 10 минут стоят 50 ₽, затем 5 ₽/мин.',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (nextOrder != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 9,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAF4FF),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.next_plan_outlined, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Следующий: ${nextOrder!.from.title} → '
                          '${nextOrder!.to.title}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
              SizedBox(
                width: double.infinity,
                height: 56,
                child: FilledButton.icon(
                  onPressed: loading ? null : onPrimaryAction,
                  icon: Icon(icon),
                  label: Text(title),
                ),
              ),
              if (onWaiting != null) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: loading ? null : onWaiting,
                    icon: const Icon(Icons.timer_outlined),
                    label: const Text('Начать ожидание'),
                  ),
                ),
              ],
              if (onUpcomingOrders != null) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: TextButton.icon(
                    onPressed: onUpcomingOrders,
                    icon: const Icon(Icons.near_me_outlined),
                    label: const Text('Посмотреть следующие заказы'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DriverMenuSheet extends StatefulWidget {
  const _DriverMenuSheet({
    required this.workState,
    required this.debt,
    required this.earnings,
    required this.paymentDetails,
    required this.reservations,
    required this.onSettingsChanged,
    required this.onPaymentDetailsChanged,
    required this.onBreak,
    required this.onEndShift,
    required this.onSupportChat,
    required this.onSwitchToPassenger,
    required this.onLogout,
  });

  final DriverWorkState? workState;
  final double debt;
  final double earnings;
  final DriverPaymentDetails? paymentDetails;
  final List<TaxiOrder> reservations;
  final Future<void> Function({
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  })
  onSettingsChanged;
  final Future<DriverPaymentDetails> Function({
    required String transferPhone,
    required String transferBank,
  })
  onPaymentDetailsChanged;
  final ValueChanged<int> onBreak;
  final VoidCallback onEndShift;
  final VoidCallback onSupportChat;
  final Future<void> Function()? onSwitchToPassenger;
  final Future<void> Function()? onLogout;

  @override
  State<_DriverMenuSheet> createState() => _DriverMenuSheetState();
}

class _DriverMenuSheetState extends State<_DriverMenuSheet> {
  late bool _taxi;
  late bool _delivery;
  late bool _background;
  late bool _night;
  late DriverPaymentDetails? _paymentDetails;

  @override
  void initState() {
    super.initState();
    final settings = widget.workState?.settings;
    _taxi = settings?.acceptsTaxi ?? true;
    _delivery = settings?.acceptsDelivery ?? true;
    _background = settings?.backgroundNotifications ?? true;
    _night = settings?.nightNotifications ?? false;
    _paymentDetails = widget.paymentDetails;
  }

  @override
  Widget build(BuildContext context) {
    final working = widget.workState?.isWorking ?? false;
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
        children: [
          const Text(
            'Водитель',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _Metric(
                  label: 'За 24 часа',
                  value: '${widget.earnings.toStringAsFixed(0)} ₽',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _Metric(
                  label: 'Комиссия',
                  value: '${widget.debt.toStringAsFixed(0)} ₽',
                ),
              ),
            ],
          ),
          if (widget.reservations.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ReservationSummary(orders: widget.reservations),
          ],
          const SizedBox(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.account_balance_outlined),
            title: const Text('Реквизиты для перевода'),
            subtitle: Text(
              _paymentDetails?.configured ?? false
                  ? '${_paymentDetails!.transferBank} · ${_paymentDetails!.transferPhone}'
                  : 'Не заполнены',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => unawaited(_editPaymentDetails()),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Такси'),
            value: _taxi,
            onChanged: (value) {
              setState(() => _taxi = value);
              unawaited(widget.onSettingsChanged(acceptsTaxi: value));
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Доставка'),
            value: _delivery,
            onChanged: (value) {
              setState(() => _delivery = value);
              unawaited(widget.onSettingsChanged(acceptsDelivery: value));
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Оповещения на линии'),
            value: _background,
            onChanged: (value) {
              setState(() => _background = value);
              unawaited(
                widget.onSettingsChanged(backgroundNotifications: value),
              );
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Вечерние и ночные оповещения'),
            value: _night,
            onChanged: (value) {
              setState(() => _night = value);
              unawaited(widget.onSettingsChanged(nightNotifications: value));
            },
          ),
          if (working) ...[
            const SizedBox(height: 8),
            const Text(
              'Перерыв',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            SegmentedButton<int>(
              showSelectedIcon: false,
              emptySelectionAllowed: true,
              segments: const [
                ButtonSegment(value: 10, label: Text('10 мин')),
                ButtonSegment(value: 30, label: Text('30 мин')),
                ButtonSegment(value: 60, label: Text('60 мин')),
              ],
              selected: const {},
              onSelectionChanged: (values) {
                if (values.isNotEmpty) {
                  widget.onBreak(values.first);
                }
              },
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: widget.onEndShift,
              icon: const Icon(Icons.stop_circle_outlined),
              label: const Text('Закончить смену'),
            ),
          ],
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.chat_bubble_outline),
            title: const Text('Чат с админом'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.of(context).pop();
              widget.onSupportChat();
            },
          ),
          if (widget.onSwitchToPassenger != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.switch_account_outlined),
              title: const Text('Пассажирский кабинет'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () async {
                Navigator.of(context).pop();
                await widget.onSwitchToPassenger!();
              },
            ),
          if (widget.onLogout != null)
            TextButton.icon(
              onPressed: () async {
                Navigator.of(context).pop();
                await widget.onLogout!();
              },
              icon: const Icon(Icons.logout),
              label: const Text('Выйти из аккаунта'),
            ),
        ],
      ),
    );
  }

  Future<void> _editPaymentDetails() async {
    final submission = await showModalBottomSheet<_PaymentDetailsSubmission>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) =>
          _PaymentDetailsSheet(paymentDetails: _paymentDetails),
    );
    if (submission == null) {
      return;
    }
    try {
      final saved = await widget.onPaymentDetailsChanged(
        transferPhone: submission.transferPhone,
        transferBank: submission.transferBank,
      );
      if (mounted) {
        setState(() => _paymentDetails = saved);
      }
    } on Object {
      // The parent screen already displays the API error.
    }
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF4F4EF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(color: Color(0xFF666666))),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentDetailsSubmission {
  const _PaymentDetailsSubmission({
    required this.transferPhone,
    required this.transferBank,
  });

  final String transferPhone;
  final String transferBank;
}

class _PaymentDetailsSheet extends StatefulWidget {
  const _PaymentDetailsSheet({required this.paymentDetails});

  final DriverPaymentDetails? paymentDetails;

  @override
  State<_PaymentDetailsSheet> createState() => _PaymentDetailsSheetState();
}

class _PaymentDetailsSheetState extends State<_PaymentDetailsSheet> {
  late final TextEditingController _phoneController;
  late final TextEditingController _bankController;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(
      text: widget.paymentDetails?.transferPhone ?? '',
    );
    _bankController = TextEditingController(
      text: widget.paymentDetails?.transferBank ?? '',
    );
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _bankController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Реквизиты для перевода',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            const Text(
              'Пассажир увидит эти данные только после принятия заказа с оплатой переводом.',
              style: TextStyle(color: Color(0xFF666666)),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Номер телефона для перевода',
                hintText: '+79141234567',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _bankController,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Банк'),
            ),
            const SizedBox(height: 18),
            SizedBox(
              height: 52,
              child: FilledButton(
                onPressed: () {
                  final phone = _phoneController.text.trim();
                  final bank = _bankController.text.trim();
                  if (phone.isEmpty || bank.isEmpty) {
                    return;
                  }
                  Navigator.of(context).pop(
                    _PaymentDetailsSubmission(
                      transferPhone: phone,
                      transferBank: bank,
                    ),
                  );
                },
                child: const Text('Сохранить'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SurveySubmission {
  const _SurveySubmission(this.answer, this.suggestion);

  final DriverSurveyAnswer answer;
  final String? suggestion;
}

class _DriverSurveySheet extends StatefulWidget {
  const _DriverSurveySheet({required this.survey});

  final DriverSurvey survey;

  @override
  State<_DriverSurveySheet> createState() => _DriverSurveySheetState();
}

class _DriverSurveySheetState extends State<_DriverSurveySheet> {
  final _suggestionController = TextEditingController();

  @override
  void dispose() {
    _suggestionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.survey.question,
              style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900),
            ),
            if (widget.survey.allowSuggestion) ...[
              const SizedBox(height: 14),
              TextField(
                controller: _suggestionController,
                maxLength: 500,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Ваше предложение',
                  hintText: 'Можно оставить пустым',
                ),
              ),
            ],
            const SizedBox(height: 14),
            Row(
              children: widget.survey.answers
                  .map(
                    (answer) => Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: answer == widget.survey.answers.last ? 0 : 8,
                        ),
                        child: answer == widget.survey.answers.first
                            ? FilledButton(
                                onPressed: () => _submit(answer),
                                child: Text(_answerLabel(answer)),
                              )
                            : OutlinedButton(
                                onPressed: () => _submit(answer),
                                child: Text(_answerLabel(answer)),
                              ),
                      ),
                    ),
                  )
                  .toList(growable: false),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Ответить позже'),
            ),
          ],
        ),
      ),
    );
  }

  void _submit(DriverSurveyAnswer answer) {
    final suggestion = _suggestionController.text.trim();
    Navigator.of(
      context,
    ).pop(_SurveySubmission(answer, suggestion.isEmpty ? null : suggestion));
  }

  String _answerLabel(DriverSurveyAnswer answer) {
    return switch (answer) {
      DriverSurveyAnswer.satisfied => 'Устраивает',
      DriverSurveyAnswer.notSatisfied => 'Не устраивает',
      DriverSurveyAnswer.good => 'Хорошая',
      DriverSurveyAnswer.bad => 'Плохая',
    };
  }
}
