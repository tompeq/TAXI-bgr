import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/finance/finance_models.dart';
import '../../core/engagement/engagement_store.dart';
import '../../core/models/address_point.dart';
import '../../core/models/address_selection.dart';
import '../../core/models/address_suggestion.dart';
import '../../core/models/geo_point.dart';
import '../../core/models/route_preview.dart';
import '../../core/models/taxi_order.dart';
import '../../core/orders/order_store.dart';
import '../../core/orders/order_quote.dart';
import '../../core/orders/driver_availability.dart';
import '../../core/support/support_store.dart';
import '../../core/services/address_search_service.dart';
import '../../core/services/service_zone_resolver.dart';
import '../../core/services/tariff_calculator.dart';
import '../../core/tracking/device_location_service.dart';
import '../../core/tracking/tracking_client.dart';
import '../../core/tracking/vehicle_location.dart';
import '../../core/utils/person_name.dart';
import '../map/taxi_map.dart';
import '../support/support_chat_sheet.dart';
import '../engagement/engagement_dialogs.dart';
import '../engagement/order_chat_sheet.dart';

class PassengerHomeScreen extends StatefulWidget {
  const PassengerHomeScreen({
    required this.orderStore,
    required this.supportStore,
    required this.engagementStore,
    this.trackingClient,
    this.onSwitchToDriver,
    this.onLogout,
    super.key,
  });

  final OrderStore orderStore;
  final SupportStore supportStore;
  final EngagementStore engagementStore;
  final TrackingClient? trackingClient;
  final Future<void> Function()? onSwitchToDriver;
  final Future<void> Function()? onLogout;

  @override
  State<PassengerHomeScreen> createState() => _PassengerHomeScreenState();
}

class _PassengerHomeScreenState extends State<PassengerHomeScreen>
    with WidgetsBindingObserver {
  static const _locationService = DeviceLocationService();
  static const _compactSheetExtent = 0.19;
  static const _orderSheetExtent = 0.72;
  static const _searchSheetExtent = 0.93;

  final _calculator = const TariffCalculator();
  final _addressSearch = AddressSearchService();
  final _fromController = TextEditingController();
  final _toController = TextEditingController();
  final _fromFocusNode = FocusNode();
  final _toFocusNode = FocusNode();
  final _sheetContentRevision = ValueNotifier<int>(0);

  AddressPoint? _from;
  AddressPoint? _to;
  AddressSelection? _activeSelection;
  AddressSelection? _mapSelection;
  AddressSelection? _suggestionsFor;
  AddressSelection? _resolvingSelection;
  List<AddressSuggestion> _suggestions = const [];
  Timer? _searchDebounce;
  Timer? _fareDebounce;
  int _searchRequest = 0;
  int _reverseRequest = 0;
  int _mapFocusRequest = 0;
  int _routeRefreshRequest = 0;
  int _fareRequest = 0;
  bool _searching = false;
  RideKind _kind = RideKind.taxi;
  PaymentMethod _paymentMethod = PaymentMethod.cash;
  int _passengers = 1;
  bool _roundTrip = false;
  bool _scheduled = false;
  DateTime _tripTime = DateTime.now().add(const Duration(minutes: 30));
  RoutePreview _routePreview = const RoutePreview.idle();
  OrderQuote? _serverQuote;
  Timer? _activeOrderTimer;
  String? _trackedOrderId;
  StreamSubscription<VehicleLocation>? _userLocationSubscription;
  VehicleLocation? _userLocation;
  String? _locationError;
  bool _locationNeedsAppSettings = false;
  bool _locationNeedsDeviceSettings = false;
  int _userLocationFocusRequest = 0;
  bool _startingUserLocation = false;
  bool _focusUserWhenReady = false;
  bool _sheetRefreshScheduled = false;
  bool _engagementDialogOpen = false;

  bool get _isPickingOnMap => _mapSelection != null;

  TariffBreakdown? get _currentTariff {
    final from = _from;
    final to = _to;
    final serverQuote = _serverQuote;
    if (from == null || to == null || serverQuote == null) {
      return null;
    }
    final calculated = _calculator.calculate(
      from: from,
      to: to,
      createdAt: DateTime.now(),
      tripTime: _tripTime,
      scheduled: _scheduled,
      roundTrip: _roundTrip,
      roadSurchargeActive: false,
      routeDistanceMeters:
          serverQuote.routeDistanceMeters?.toDouble() ??
          _routePreview.distanceMeters,
      distanceRatePerKm: serverQuote.distanceRatePerKm ?? 60,
      forceDistanceBased: serverQuote.pricingMode == OrderPricingMode.distance,
    );
    return TariffBreakdown(
      baseFare: calculated.baseFare,
      periodFare: calculated.periodFare,
      waitingFare: calculated.waitingFare,
      roadSurcharge: calculated.roadSurcharge,
      roundTrip: calculated.roundTrip,
      total: serverQuote.fare,
      period: calculated.period,
      isDistanceBased: calculated.isDistanceBased,
      distanceRatePerKm: calculated.distanceRatePerKm,
      routeDistanceMeters: calculated.routeDistanceMeters,
    );
  }

  void _refreshOrderSheet() {
    if (_sheetRefreshScheduled) {
      return;
    }
    _sheetRefreshScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _sheetRefreshScheduled = false;
      if (mounted) {
        _sheetContentRevision.value++;
      }
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _fromFocusNode.addListener(_onAddressFocusChanged);
    _toFocusNode.addListener(_onAddressFocusChanged);
    widget.orderStore.addListener(_onOrderStoreChanged);
    widget.trackingClient?.addListener(_onTrackingChanged);
    unawaited(
      widget.orderStore.loadPassengerActive().catchError((Object _) {}),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(_startUserLocation());
        unawaited(_showPendingEngagement());
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.orderStore.removeListener(_onOrderStoreChanged);
    _searchDebounce?.cancel();
    _fareDebounce?.cancel();
    _activeOrderTimer?.cancel();
    _userLocationSubscription?.cancel();
    widget.trackingClient?.removeListener(_onTrackingChanged);
    widget.trackingClient?.clearOrder();
    _addressSearch.dispose();
    _fromFocusNode
      ..removeListener(_onAddressFocusChanged)
      ..dispose();
    _toFocusNode
      ..removeListener(_onAddressFocusChanged)
      ..dispose();
    _fromController.dispose();
    _toController.dispose();
    _sheetContentRevision.dispose();
    super.dispose();
  }

  void _onOrderStoreChanged() {
    final order = widget.orderStore.activePassengerOrder;
    final completedOrClosed = order == null && _trackedOrderId != null;
    if (order?.id != _trackedOrderId) {
      unawaited(_syncTracking(order));
    }
    if (completedOrClosed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_showPendingEngagement());
      });
    }
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
    _activeOrderTimer?.cancel();
    if (order == null) {
      widget.trackingClient?.clearOrder();
      return;
    }
    await widget.trackingClient?.connectToOrder(order.id);
    _activeOrderTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => unawaited(
        widget.orderStore.refreshPassengerActive().catchError((_) {}),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeOrder = widget.orderStore.activePassengerOrder;
    final routeReady = _routePreview.status == RoutePreviewStatus.ready;
    final canExpandOrderSheet = _suggestionsFor != null || routeReady;
    final sheetInitialExtent = _suggestionsFor != null
        ? _searchSheetExtent
        : routeReady
        ? _orderSheetExtent
        : _compactSheetExtent;
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          Positioned.fill(
            child: TaxiMap(
              from: activeOrder?.from ?? _from,
              to: activeOrder?.to ?? _to,
              activeSelection: activeOrder == null ? _mapSelection : null,
              focusSelection: activeOrder == null ? _activeSelection : null,
              focusRequest: _mapFocusRequest,
              routeRefreshRequest: _routeRefreshRequest,
              vehiclePosition: widget.trackingClient?.driverLocation?.point,
              vehicleHeading:
                  widget.trackingClient?.driverLocation?.heading ?? 0,
              userPosition: _userLocation?.point,
              showUserLocation: _userLocation != null,
              userLocationFocusRequest: _userLocationFocusRequest,
              onCameraMoveStarted: _onCameraMoveStarted,
              onCameraIdle: _onCameraIdle,
              onRouteChanged: _onRouteChanged,
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
              child: Row(
                children: [
                  _RoundIconButton(
                    icon: Icons.menu,
                    tooltip: 'Меню',
                    onPressed: _showAccountMenu,
                  ),
                  const SizedBox(width: 10),
                  const _BrandPill(),
                  const Spacer(),
                  _RoundIconButton(
                    icon: Icons.chat_bubble_outline,
                    tooltip: 'Чат',
                    onPressed: _showSupportChat,
                  ),
                ],
              ),
            ),
          ),
          if (activeOrder == null)
            Positioned(
              right: 14,
              top: 116,
              child: Column(
                children: [
                  _RoundIconButton(
                    icon: _isPickingOnMap
                        ? Icons.close
                        : Icons.add_location_alt_outlined,
                    tooltip: _isPickingOnMap
                        ? 'Отменить выбор точки'
                        : 'Выбрать точку на карте',
                    onPressed: _isPickingOnMap
                        ? _cancelMapSelection
                        : () => _activateMapSelection(
                            _activeSelection ?? AddressSelection.from,
                          ),
                  ),
                  if (!_isPickingOnMap) ...[
                    const SizedBox(height: 10),
                    _RoundIconButton(
                      icon: Icons.my_location,
                      tooltip: 'Моё местоположение',
                      onPressed: () =>
                          unawaited(_startUserLocation(centerOnLocation: true)),
                    ),
                  ],
                ],
              ),
            ),
          if (activeOrder == null && _locationError != null && !_isPickingOnMap)
            Positioned(
              top: 220,
              right: 14,
              child: _PassengerLocationNotice(
                message: _locationError!,
                actionLabel: _locationNeedsAppSettings
                    ? 'Настройки'
                    : _locationNeedsDeviceSettings
                    ? 'Включить'
                    : 'Повторить',
                onTap: () => unawaited(_handleLocationNoticeTap()),
              ),
            ),
          if (activeOrder != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: _PassengerActiveOrderPanel(
                order: activeOrder,
                paymentDetails: widget.orderStore.passengerTransferDetails,
                onCancel: _cancelPassengerOrder,
                onChat: activeOrder.driverName == null
                    ? null
                    : () => _showOrderChat(activeOrder),
              ),
            )
          else
            IgnorePointer(
              ignoring: _isPickingOnMap,
              child: AnimatedSlide(
                offset: _isPickingOnMap ? const Offset(0, 1.15) : Offset.zero,
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                child: DraggableScrollableSheet(
                  key: ValueKey(sheetInitialExtent),
                  initialChildSize: sheetInitialExtent,
                  minChildSize: 0.17,
                  maxChildSize: canExpandOrderSheet
                      ? 0.94
                      : _compactSheetExtent,
                  builder: (context, scrollController) {
                    return ValueListenableBuilder<int>(
                      valueListenable: _sheetContentRevision,
                      builder: (context, _, _) {
                        final sheetRouteReady =
                            _routePreview.status == RoutePreviewStatus.ready;
                        final sheetTariff = _currentTariff;
                        return _OrderSheet(
                          scrollController: scrollController,
                          fromController: _fromController,
                          toController: _toController,
                          fromFocusNode: _fromFocusNode,
                          toFocusNode: _toFocusNode,
                          fromSelected: _from != null,
                          toSelected: _to != null,
                          activeSelection: _activeSelection,
                          suggestionsFor: _suggestionsFor,
                          suggestionsNeedSelection:
                              _suggestionsFor == AddressSelection.from
                              ? _from == null
                              : _suggestionsFor == AddressSelection.to
                              ? _to == null
                              : false,
                          resolvingSelection: _resolvingSelection,
                          suggestions: _suggestions,
                          searching: _searching,
                          showOrderDetails: sheetRouteReady,
                          kind: _kind,
                          paymentMethod: _paymentMethod,
                          passengers: _passengers,
                          roundTrip: _roundTrip,
                          scheduled: _scheduled,
                          tripTime: _tripTime,
                          tariff: sheetTariff,
                          routePreview: _routePreview,
                          onAddressActivated: _activateSelection,
                          onAddressChanged: _onAddressChanged,
                          onAddressSubmitted: _submitAddress,
                          onSuggestionSelected: _selectSuggestion,
                          onMapSelectionRequested: _activateMapSelection,
                          onAddressCleared: _clearAddress,
                          onKindChanged: (value) {
                            setState(() => _kind = value);
                            _refreshOrderSheet();
                            _scheduleFareQuote();
                          },
                          onPaymentChanged: (value) {
                            setState(() => _paymentMethod = value);
                            _refreshOrderSheet();
                          },
                          onPassengersChanged: (value) {
                            setState(() => _passengers = value);
                            _refreshOrderSheet();
                          },
                          onRoundTripChanged: (value) {
                            setState(() => _roundTrip = value);
                            _refreshOrderSheet();
                            _scheduleFareQuote();
                          },
                          onTripTimeTap: _pickTripTime,
                          onTripTimeClear: _clearTripTime,
                          onCreateOrder:
                              !sheetRouteReady ||
                                  sheetTariff == null ||
                                  widget.orderStore.loading
                              ? null
                              : () => _createOrder(sheetTariff.total),
                        );
                      },
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _showAccountMenu() async {
    final onSwitchToDriver = widget.onSwitchToDriver;
    final onLogout = widget.onLogout;
    if (onSwitchToDriver == null && onLogout == null) {
      return;
    }
    final action = await showModalBottomSheet<_PassengerAccountAction>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (onSwitchToDriver != null)
              ListTile(
                leading: const Icon(Icons.switch_account_outlined),
                title: const Text('Водительский кабинет'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(
                  context,
                ).pop(_PassengerAccountAction.switchToDriver),
              ),
            if (onLogout != null)
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Выйти из аккаунта'),
                onTap: () =>
                    Navigator.of(context).pop(_PassengerAccountAction.logout),
              ),
          ],
        ),
      ),
    );
    if (action == _PassengerAccountAction.switchToDriver) {
      await onSwitchToDriver?.call();
    } else if (action == _PassengerAccountAction.logout) {
      await onLogout?.call();
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

  Future<void> _showPendingEngagement() async {
    if (!mounted || _engagementDialogOpen) return;
    _engagementDialogOpen = true;
    try {
      await showPendingEngagementDialogs(context, widget.engagementStore);
    } finally {
      _engagementDialogOpen = false;
    }
  }

  void _activateSelection(AddressSelection selection) {
    if (_activeSelection == selection && _suggestionsFor == selection) {
      return;
    }
    final selectedAddress = selection == AddressSelection.from ? _from : _to;
    final controller = selection == AddressSelection.from
        ? _fromController
        : _toController;
    final query = controller.text.trim();
    final suggestions = query.isEmpty
        ? _addressSearch.initialSuggestions()
        : _addressSearch.localSuggestions(query);
    setState(() {
      _mapSelection = null;
      _activeSelection = selection;
      if (selectedAddress != null) {
        _mapFocusRequest++;
      }
      _suggestions = suggestions;
      _suggestionsFor = selection;
      _searching = false;
    });
    _refreshOrderSheet();
  }

  void _onAddressFocusChanged() {
    if (_isPickingOnMap) {
      return;
    }
    final selection = _fromFocusNode.hasFocus
        ? AddressSelection.from
        : _toFocusNode.hasFocus
        ? AddressSelection.to
        : null;
    if (selection != null) {
      _activateSelection(selection);
    }
  }

  void _activateMapSelection(AddressSelection selection) {
    FocusManager.instance.primaryFocus?.unfocus();
    _searchDebounce?.cancel();
    _searchRequest++;
    _reverseRequest++;
    setState(() {
      _activeSelection = selection;
      _mapSelection = selection;
      _mapFocusRequest++;
      _routePreview = const RoutePreview.idle();
      _suggestions = const [];
      _suggestionsFor = null;
      _searching = false;
    });
    _refreshOrderSheet();
  }

  void _cancelMapSelection() {
    _reverseRequest++;
    final shouldRestoreRoute = _from != null && _to != null;
    setState(() {
      _mapSelection = null;
      _resolvingSelection = null;
      if (shouldRestoreRoute) {
        _routeRefreshRequest++;
      }
    });
    _refreshOrderSheet();
  }

  void _onAddressChanged(AddressSelection selection, String value) {
    _searchDebounce?.cancel();
    _reverseRequest++;
    final request = ++_searchRequest;
    final query = value.trim();
    setState(() {
      _activeSelection = selection;
      _mapSelection = null;
      _setSelectedAddress(selection, null);
      _routePreview = const RoutePreview.idle();
      _resolvingSelection = null;
      _suggestionsFor = selection;
      _suggestions = query.isEmpty
          ? _addressSearch.initialSuggestions()
          : _addressSearch.localSuggestions(query);
      _searching = query.isNotEmpty;
    });
    _refreshOrderSheet();
    _scheduleFareQuote();

    if (query.isEmpty) {
      return;
    }

    _searchDebounce = Timer(const Duration(milliseconds: 180), () async {
      List<AddressSuggestion> suggestions;
      try {
        suggestions = await _addressSearch.suggest(query);
      } on Object {
        suggestions = const [];
      }
      if (!mounted || request != _searchRequest) {
        return;
      }
      setState(() {
        _suggestionsFor = selection;
        _suggestions = suggestions;
        _searching = false;
      });
      _refreshOrderSheet();
    });
  }

  Future<void> _submitAddress(AddressSelection selection, String value) async {
    final query = value.trim();
    if (query.isEmpty) {
      return;
    }

    _searchDebounce?.cancel();
    _reverseRequest++;
    final request = ++_searchRequest;
    setState(() {
      _activeSelection = selection;
      _mapSelection = null;
      _suggestionsFor = selection;
      _suggestions = _addressSearch.localSuggestions(query);
      _searching = true;
    });
    _refreshOrderSheet();
    List<AddressSuggestion> suggestions;
    try {
      suggestions = await _addressSearch.suggest(query);
    } on Object {
      suggestions = const [];
    }
    if (!mounted || request != _searchRequest) {
      return;
    }
    setState(() {
      _suggestions = suggestions;
      _searching = false;
    });
    _refreshOrderSheet();
    if (suggestions.isEmpty) {
      _showAddressNotFound();
    }
  }

  Future<void> _selectSuggestion(
    AddressSelection selection,
    AddressSuggestion suggestion,
  ) async {
    _reverseRequest++;
    final request = ++_searchRequest;
    setState(() {
      _activeSelection = selection;
      _mapSelection = null;
      _suggestionsFor = selection;
      _searching = true;
    });
    _refreshOrderSheet();
    final address = await _addressSearch.resolveSuggestion(suggestion);
    if (!mounted || request != _searchRequest) {
      return;
    }
    if (address == null) {
      setState(() => _searching = false);
      _refreshOrderSheet();
      _showAddressNotFound();
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    _applyAddress(selection, address);
  }

  void _onCameraMoveStarted() {
    if (!_isPickingOnMap) {
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    _searchDebounce?.cancel();
    _searchRequest++;
    _reverseRequest++;
    setState(() {
      _suggestions = const [];
      _suggestionsFor = null;
      _searching = false;
    });
    _refreshOrderSheet();
  }

  Future<void> _onCameraIdle(GeoPoint point) async {
    final selection = _mapSelection;
    if (selection == null) {
      return;
    }

    final request = ++_reverseRequest;
    setState(() => _resolvingSelection = selection);
    AddressPoint? resolved;
    try {
      resolved = await _addressSearch.reverse(point);
    } on Object {
      resolved = null;
    }
    if (!mounted || request != _reverseRequest) {
      return;
    }

    final address =
        resolved ??
        AddressPoint(
          id: 'map-${point.latitude}-${point.longitude}',
          title: 'Точка на карте',
          subtitle:
              '${point.latitude.toStringAsFixed(5)}, '
              '${point.longitude.toStringAsFixed(5)}',
          zone: ServiceZoneResolver.resolve(point),
          coordinates: point,
        );
    _applyAddress(selection, address, keepMapFocus: true);
  }

  void _applyAddress(
    AddressSelection selection,
    AddressPoint address, {
    bool keepMapFocus = false,
  }) {
    final controller = selection == AddressSelection.from
        ? _fromController
        : _toController;
    controller.value = TextEditingValue(
      text: address.title,
      selection: TextSelection.collapsed(offset: address.title.length),
    );
    setState(() {
      _setSelectedAddress(selection, address);
      _activeSelection = selection;
      _mapSelection = null;
      if (!keepMapFocus) {
        _mapFocusRequest++;
      }
      _resolvingSelection = null;
      _suggestions = const [];
      _suggestionsFor = null;
      _searching = false;
    });
    _refreshOrderSheet();
    _scheduleFareQuote();

    if (!keepMapFocus) {
      FocusManager.instance.primaryFocus?.unfocus();
    }
  }

  void _clearAddress(AddressSelection selection) {
    _searchDebounce?.cancel();
    _searchRequest++;
    _reverseRequest++;
    final controller = selection == AddressSelection.from
        ? _fromController
        : _toController;
    controller.clear();
    setState(() {
      _setSelectedAddress(selection, null);
      _routePreview = const RoutePreview.idle();
      _activeSelection = selection;
      _mapSelection = null;
      _suggestions = _addressSearch.initialSuggestions();
      _suggestionsFor = selection;
      _searching = false;
    });
    _refreshOrderSheet();
    _scheduleFareQuote();
  }

  Future<void> _startUserLocation({bool centerOnLocation = false}) async {
    if (centerOnLocation) {
      _focusUserWhenReady = true;
      if (_userLocation != null) {
        setState(() => _userLocationFocusRequest++);
        _focusUserWhenReady = false;
        return;
      }
    }
    if (_userLocationSubscription != null || _startingUserLocation) {
      return;
    }

    _startingUserLocation = true;
    try {
      final stream = await _locationService.watchForMap();
      _userLocationSubscription = stream.listen(
        _onUserLocation,
        onError: (Object _) {
          _userLocationSubscription?.cancel();
          _userLocationSubscription = null;
          if (mounted) {
            setState(() {
              _locationError =
                  'Не удаётся определить геопозицию. Проверьте, что она включена.';
              _locationNeedsAppSettings = false;
              _locationNeedsDeviceSettings = true;
            });
          }
        },
      );
    } on LocationPermissionException catch (error) {
      if (mounted) {
        setState(() {
          _locationError = error.message;
          _locationNeedsAppSettings = !error.locationServiceDisabled;
          _locationNeedsDeviceSettings = error.locationServiceDisabled;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _locationError =
              'Не удаётся определить геопозицию. Попробуйте ещё раз.';
          _locationNeedsAppSettings = false;
          _locationNeedsDeviceSettings = true;
        });
      }
    } finally {
      _startingUserLocation = false;
    }
  }

  void _onUserLocation(VehicleLocation location) {
    if (!mounted) {
      return;
    }
    setState(() {
      _userLocation = location;
      _locationError = null;
      _locationNeedsAppSettings = false;
      _locationNeedsDeviceSettings = false;
      if (_focusUserWhenReady) {
        _userLocationFocusRequest++;
        _focusUserWhenReady = false;
      }
    });
  }

  Future<void> _handleLocationNoticeTap() async {
    if (!_locationNeedsAppSettings && !_locationNeedsDeviceSettings) {
      await _startUserLocation(centerOnLocation: true);
      return;
    }
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
    unawaited(_startUserLocation());
  }

  void _setSelectedAddress(AddressSelection selection, AddressPoint? address) {
    if (selection == AddressSelection.from) {
      _from = address;
    } else {
      _to = address;
    }
  }

  void _onRouteChanged(RoutePreview preview) {
    if (!mounted) {
      return;
    }
    final previous = _routePreview;
    setState(() => _routePreview = preview);
    _refreshOrderSheet();
    final routeNowReady = preview.status == RoutePreviewStatus.ready;
    final routeChanged =
        previous.status != preview.status ||
        previous.distanceMeters != preview.distanceMeters;
    if (routeNowReady && routeChanged) {
      _scheduleFareQuote();
    }
  }

  Future<void> _pickTripTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_tripTime),
      initialEntryMode: TimePickerEntryMode.input,
      helpText: 'Время подачи',
      cancelText: 'Отмена',
      confirmText: 'Готово',
      hourLabelText: 'Часы',
      minuteLabelText: 'Минуты',
      errorInvalidText: 'Введите корректное время',
      builder: (context, child) {
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
          child: child!,
        );
      },
    );

    if (picked == null || !mounted) {
      return;
    }

    final now = DateTime.now();
    var selected = DateTime(
      now.year,
      now.month,
      now.day,
      picked.hour,
      picked.minute,
    );
    if (!selected.isAfter(now)) {
      selected = selected.add(const Duration(days: 1));
    }
    setState(() {
      _scheduled = true;
      _tripTime = selected;
    });
    _refreshOrderSheet();
    _scheduleFareQuote();
  }

  void _clearTripTime() {
    setState(() {
      _scheduled = false;
      _tripTime = DateTime.now().add(const Duration(minutes: 30));
    });
    _refreshOrderSheet();
    _scheduleFareQuote();
  }

  void _scheduleFareQuote() {
    _fareDebounce?.cancel();
    final request = ++_fareRequest;
    if (_serverQuote != null) {
      setState(() => _serverQuote = null);
      _refreshOrderSheet();
    }
    if (_from == null || _to == null || _kind == RideKind.companion) {
      return;
    }
    _fareDebounce = Timer(
      const Duration(milliseconds: 250),
      () => unawaited(_loadFareQuote(request)),
    );
  }

  Future<void> _loadFareQuote(int request) async {
    final from = _from;
    final to = _to;
    if (from == null || to == null) {
      return;
    }
    final now = DateTime.now();
    try {
      final quote = await widget.orderStore.quoteOrder(
        TaxiOrder(
          id: '',
          from: from,
          to: to,
          kind: _kind,
          paymentMethod: _paymentMethod,
          passengers: _passengers,
          roundTrip: _roundTrip,
          scheduled: _scheduled,
          createdAt: now,
          tripTime: _scheduled ? _tripTime : now,
          fare: 0,
          routeDistanceMeters: _routePreview.distanceMeters?.round(),
        ),
      );
      if (!mounted || request != _fareRequest) {
        return;
      }
      setState(() => _serverQuote = quote);
      _refreshOrderSheet();
    } on Object {
      if (mounted && request == _fareRequest) {
        setState(() => _serverQuote = null);
        _refreshOrderSheet();
      }
    }
  }

  Future<void> _createOrder(int fare) async {
    final from = _from;
    final to = _to;
    if (from == null || to == null) {
      return;
    }

    final now = DateTime.now();
    try {
      final availability = await widget.orderStore.getDriverAvailability(_kind);
      if (!availability.hasAvailableDrivers &&
          !(await _confirmNoDrivers(availability))) {
        return;
      }
      if (!mounted) {
        return;
      }
      final created = await widget.orderStore.createOrder(
        TaxiOrder(
          id: '',
          from: from,
          to: to,
          kind: _kind,
          paymentMethod: _paymentMethod,
          passengers: _passengers,
          roundTrip: _roundTrip,
          scheduled: _scheduled,
          createdAt: now,
          tripTime: _scheduled ? _tripTime : now,
          fare: fare,
          pricingMode: _serverQuote?.pricingMode ?? OrderPricingMode.fixed,
          routeDistanceMeters: _routePreview.distanceMeters?.round(),
          distanceRatePerKm: _serverQuote?.distanceRatePerKm,
        ),
      );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Заказ создан. Стоимость: ${created.fare} ₽')),
      );
      await _syncTracking(created);
    } on Object {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.orderStore.errorMessage ?? 'Не удалось создать заказ',
          ),
        ),
      );
    }
  }

  Future<bool> _confirmNoDrivers(DriverAvailability availability) async {
    if (!mounted) {
      return false;
    }
    final isNight = availability.waitMinutes > 0;
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          isNight ? 'Водителей пока нет' : 'Сейчас нет водителей на линии',
        ),
        content: Text(
          isNight
              ? 'Пожалуйста, подождите ${availability.waitMinutes} минут и попробуйте заказать снова. Водители могут выйти на линию.'
              : 'Заказ можно оставить на доске: водитель увидит его, когда выйдет на линию.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(isNight ? 'Понятно' : 'Не сейчас'),
          ),
          if (!isNight)
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Оставить заявку'),
            ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _cancelPassengerOrder() async {
    final shouldCancel = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Отменить заказ?'),
        content: const Text(
          'После трёх минут может применяться плата за отмену.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Оставить заказ'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Отменить'),
          ),
        ],
      ),
    );
    if (shouldCancel != true || !mounted) {
      return;
    }
    try {
      final canceled = await widget.orderStore.cancelPassengerOrder(
        'Пассажир отменил заказ',
      );
      if (!mounted || canceled == null) {
        return;
      }
      final message = canceled.cancellationFee == 0
          ? 'Заказ отменён без доплаты'
          : 'Заказ отменён. К оплате: ${canceled.cancellationFee} ₽';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
    } on Object {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.orderStore.errorMessage ?? 'Не удалось отменить заказ',
          ),
        ),
      );
    }
  }

  void _showAddressNotFound() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Адрес не найден. Попробуйте уточнить улицу и дом.'),
      ),
    );
  }

  void _showSupportChat() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SupportChatSheet(
        store: widget.supportStore,
        title: 'Чат с поддержкой',
      ),
    );
  }
}

enum _PassengerAccountAction { switchToDriver, logout }

class _PassengerActiveOrderPanel extends StatelessWidget {
  const _PassengerActiveOrderPanel({
    required this.order,
    required this.paymentDetails,
    required this.onCancel,
    required this.onChat,
  });

  final TaxiOrder order;
  final TransferPaymentDetails? paymentDetails;
  final VoidCallback onCancel;
  final VoidCallback? onChat;

  @override
  Widget build(BuildContext context) {
    final (title, subtitle, icon) = switch (order.status) {
      OrderStatus.open => (
        'Ищем водителя',
        'Показываем заказ водителям на линии',
        Icons.search,
      ),
      OrderStatus.accepted => (
        'Водитель принял заказ',
        'Скоро он отправится к вам',
        Icons.local_taxi,
      ),
      OrderStatus.driverEnRoute => (
        'Водитель едет к вам',
        'Автомобиль отображается на карте',
        Icons.navigation,
      ),
      OrderStatus.arrived => (
        'Водитель на месте',
        'Можно выходить',
        Icons.location_on,
      ),
      OrderStatus.waiting => (
        'Водитель ожидает',
        'Первые 10 минут — 50 ₽, затем 5 ₽/мин',
        Icons.timer_outlined,
      ),
      OrderStatus.started => (
        'Поездка началась',
        'Следите за маршрутом на карте',
        Icons.route,
      ),
      _ => ('Заказ завершён', '', Icons.check_circle),
    };

    return Material(
      color: Colors.white,
      elevation: 14,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      color: Color(0xFFFFE45C),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: const TextStyle(color: Color(0xFF666666)),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    '${order.fare} ₽',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              if (order.status == OrderStatus.open) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(minHeight: 3),
              ],
              if (order.driverName != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF6F5F0),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.directions_car_outlined),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              personFirstName(
                                order.driverName!,
                                familyNameFirst: true,
                              ),
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            if (order.driverVehicle?.hasDetails == true)
                              Text(
                                [
                                  order.driverVehicle!.makeModel,
                                  order.driverVehicle!.color,
                                ].whereType<String>().join(' · '),
                                style: const TextStyle(
                                  color: Color(0xFF666666),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (order.driverVehicle?.plate?.isNotEmpty == true)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border.all(color: const Color(0xFFBDBDBD)),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text(
                            order.driverVehicle!.plate!,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              _ActiveAddressLine(
                icon: Icons.radio_button_checked,
                text: order.from.title,
              ),
              const SizedBox(height: 8),
              _ActiveAddressLine(icon: Icons.location_on, text: order.to.title),
              const SizedBox(height: 12),
              if (onChat != null) ...[
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonalIcon(
                    onPressed: onChat,
                    icon: const Icon(Icons.chat_bubble_outline),
                    label: const Text('Чат с водителем'),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: onCancel,
                  icon: const Icon(Icons.close_outlined),
                  label: const Text('Отменить заказ'),
                ),
              ),
              if (order.paymentMethod == PaymentMethod.transfer &&
                  order.driverName != null) ...[
                const SizedBox(height: 14),
                const Divider(height: 1),
                const SizedBox(height: 14),
                const Text(
                  'Перевод водителю',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                if (paymentDetails == null)
                  const Text(
                    'Водитель ещё не указал реквизиты для перевода.',
                    style: TextStyle(color: Color(0xFF666666)),
                  )
                else ...[
                  Text(
                    '${personFirstName(paymentDetails!.driverName, familyNameFirst: true)} · '
                    '${paymentDetails!.transferBank}',
                    style: const TextStyle(color: Color(0xFF666666)),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          paymentDetails!.transferPhone,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Скопировать номер',
                        onPressed: () async {
                          await Clipboard.setData(
                            ClipboardData(text: paymentDetails!.transferPhone),
                          );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Номер скопирован')),
                            );
                          }
                        },
                        icon: const Icon(Icons.copy_outlined),
                      ),
                    ],
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveAddressLine extends StatelessWidget {
  const _ActiveAddressLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFF555555)),
        const SizedBox(width: 10),
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

class _OrderSheet extends StatelessWidget {
  const _OrderSheet({
    required this.scrollController,
    required this.fromController,
    required this.toController,
    required this.fromFocusNode,
    required this.toFocusNode,
    required this.fromSelected,
    required this.toSelected,
    required this.activeSelection,
    required this.suggestionsFor,
    required this.suggestionsNeedSelection,
    required this.resolvingSelection,
    required this.suggestions,
    required this.searching,
    required this.showOrderDetails,
    required this.kind,
    required this.paymentMethod,
    required this.passengers,
    required this.roundTrip,
    required this.scheduled,
    required this.tripTime,
    required this.tariff,
    required this.routePreview,
    required this.onAddressActivated,
    required this.onAddressChanged,
    required this.onAddressSubmitted,
    required this.onSuggestionSelected,
    required this.onMapSelectionRequested,
    required this.onAddressCleared,
    required this.onKindChanged,
    required this.onPaymentChanged,
    required this.onPassengersChanged,
    required this.onRoundTripChanged,
    required this.onTripTimeTap,
    required this.onTripTimeClear,
    required this.onCreateOrder,
  });

  final ScrollController scrollController;
  final TextEditingController fromController;
  final TextEditingController toController;
  final FocusNode fromFocusNode;
  final FocusNode toFocusNode;
  final bool fromSelected;
  final bool toSelected;
  final AddressSelection? activeSelection;
  final AddressSelection? suggestionsFor;
  final bool suggestionsNeedSelection;
  final AddressSelection? resolvingSelection;
  final List<AddressSuggestion> suggestions;
  final bool searching;
  final bool showOrderDetails;
  final RideKind kind;
  final PaymentMethod paymentMethod;
  final int passengers;
  final bool roundTrip;
  final bool scheduled;
  final DateTime tripTime;
  final TariffBreakdown? tariff;
  final RoutePreview routePreview;
  final ValueChanged<AddressSelection> onAddressActivated;
  final void Function(AddressSelection selection, String value)
  onAddressChanged;
  final Future<void> Function(AddressSelection selection, String value)
  onAddressSubmitted;
  final void Function(AddressSelection selection, AddressSuggestion suggestion)
  onSuggestionSelected;
  final ValueChanged<AddressSelection> onMapSelectionRequested;
  final ValueChanged<AddressSelection> onAddressCleared;
  final ValueChanged<RideKind> onKindChanged;
  final ValueChanged<PaymentMethod> onPaymentChanged;
  final ValueChanged<int> onPassengersChanged;
  final ValueChanged<bool> onRoundTripChanged;
  final VoidCallback onTripTimeTap;
  final VoidCallback onTripTimeClear;
  final VoidCallback? onCreateOrder;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: [
          BoxShadow(
            color: Color(0x26000000),
            blurRadius: 28,
            offset: Offset(0, -8),
          ),
        ],
      ),
      child: ListView(
        controller: scrollController,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
        children: [
          Center(
            child: Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFD8D8D8),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _AddressEditor(
            fromController: fromController,
            toController: toController,
            fromFocusNode: fromFocusNode,
            toFocusNode: toFocusNode,
            fromSelected: fromSelected,
            toSelected: toSelected,
            activeSelection: activeSelection,
            resolvingSelection: resolvingSelection,
            onActivated: onAddressActivated,
            onChanged: onAddressChanged,
            onSubmitted: onAddressSubmitted,
            onMapSelectionRequested: onMapSelectionRequested,
            onCleared: onAddressCleared,
          ),
          if (suggestionsFor != null) ...[
            const SizedBox(height: 8),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  suggestionsNeedSelection
                      ? 'Выберите адрес из подсказок'
                      : 'Подсказки',
                  style: TextStyle(
                    color: Color(0xFF8A5A00),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            _AddressSuggestionList(
              searching: searching,
              suggestions: suggestions,
              onSelected: (suggestion) =>
                  onSuggestionSelected(suggestionsFor!, suggestion),
            ),
          ] else if (showOrderDetails) ...[
            const SizedBox(height: 14),
            _RouteLine(preview: routePreview),
            const SizedBox(height: 14),
            _ModeSelector(kind: kind, onChanged: onKindChanged),
            const SizedBox(height: 14),
            _PassengerSelector(
              value: passengers,
              onChanged: onPassengersChanged,
            ),
            const SizedBox(height: 14),
            _TripOptions(
              paymentMethod: paymentMethod,
              roundTrip: roundTrip,
              scheduled: scheduled,
              tripTime: tripTime,
              onPaymentChanged: onPaymentChanged,
              onRoundTripChanged: onRoundTripChanged,
              onTripTimeTap: onTripTimeTap,
              onTripTimeClear: onTripTimeClear,
            ),
            if (tariff != null) ...[
              const SizedBox(height: 10),
              _FareLine(tariff: tariff!),
            ],
            const SizedBox(height: 14),
            FilledButton(
              onPressed: onCreateOrder,
              child: Text(
                tariff == null
                    ? 'Считаем стоимость'
                    : 'Заказать · ${tariff!.total} ₽',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AddressEditor extends StatelessWidget {
  const _AddressEditor({
    required this.fromController,
    required this.toController,
    required this.fromFocusNode,
    required this.toFocusNode,
    required this.fromSelected,
    required this.toSelected,
    required this.activeSelection,
    required this.resolvingSelection,
    required this.onActivated,
    required this.onChanged,
    required this.onSubmitted,
    required this.onMapSelectionRequested,
    required this.onCleared,
  });

  final TextEditingController fromController;
  final TextEditingController toController;
  final FocusNode fromFocusNode;
  final FocusNode toFocusNode;
  final bool fromSelected;
  final bool toSelected;
  final AddressSelection? activeSelection;
  final AddressSelection? resolvingSelection;
  final ValueChanged<AddressSelection> onActivated;
  final void Function(AddressSelection selection, String value) onChanged;
  final Future<void> Function(AddressSelection selection, String value)
  onSubmitted;
  final ValueChanged<AddressSelection> onMapSelectionRequested;
  final ValueChanged<AddressSelection> onCleared;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF5F4EF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFE7E1D2)),
      ),
      child: Column(
        children: [
          _AddressTextField(
            controller: fromController,
            focusNode: fromFocusNode,
            selection: AddressSelection.from,
            label: 'Откуда',
            icon: Icons.radio_button_checked,
            selected: fromSelected,
            active: activeSelection == AddressSelection.from,
            resolving: resolvingSelection == AddressSelection.from,
            onActivated: onActivated,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            onMapSelectionRequested: onMapSelectionRequested,
            onCleared: onCleared,
          ),
          const Divider(height: 1, indent: 52),
          _AddressTextField(
            controller: toController,
            focusNode: toFocusNode,
            selection: AddressSelection.to,
            label: 'Куда',
            icon: Icons.place,
            selected: toSelected,
            active: activeSelection == AddressSelection.to,
            resolving: resolvingSelection == AddressSelection.to,
            onActivated: onActivated,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            onMapSelectionRequested: onMapSelectionRequested,
            onCleared: onCleared,
          ),
        ],
      ),
    );
  }
}

class _AddressSuggestionList extends StatelessWidget {
  const _AddressSuggestionList({
    required this.searching,
    required this.suggestions,
    required this.onSelected,
  });

  final bool searching;
  final List<AddressSuggestion> suggestions;
  final ValueChanged<AddressSuggestion> onSelected;

  @override
  Widget build(BuildContext context) {
    if (!searching && suggestions.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(8, 34, 8, 24),
        child: Column(
          children: [
            Icon(Icons.search_off_outlined, size: 30, color: Color(0xFF9B9B9B)),
            SizedBox(height: 10),
            Text(
              'Подсказок пока нет. Уточните улицу или номер дома.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF777777)),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        if (searching) const LinearProgressIndicator(minHeight: 2),
        ...suggestions.indexed.map((entry) {
          final (index, suggestion) = entry;
          return Column(
            children: [
              if (index > 0)
                const Divider(height: 1, indent: 50, endIndent: 12),
              Material(
                color: Colors.transparent,
                child: ListTile(
                  minTileHeight: 64,
                  contentPadding: const EdgeInsets.only(left: 12, right: 6),
                  leading: const Icon(
                    Icons.location_on_outlined,
                    color: Color(0xFF9B9B9B),
                    size: 25,
                  ),
                  title: Text(
                    suggestion.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: suggestion.subtitle.isEmpty
                      ? null
                      : Text(
                          suggestion.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Color(0xFF8A8A8A)),
                        ),
                  trailing: const Icon(Icons.chevron_right, size: 21),
                  onTap: () => onSelected(suggestion),
                ),
              ),
            ],
          );
        }),
      ],
    );
  }
}

class _AddressTextField extends StatelessWidget {
  const _AddressTextField({
    required this.controller,
    required this.focusNode,
    required this.selection,
    required this.label,
    required this.icon,
    required this.selected,
    required this.active,
    required this.resolving,
    required this.onActivated,
    required this.onChanged,
    required this.onSubmitted,
    required this.onMapSelectionRequested,
    required this.onCleared,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final AddressSelection selection;
  final String label;
  final IconData icon;
  final bool selected;
  final bool active;
  final bool resolving;
  final ValueChanged<AddressSelection> onActivated;
  final void Function(AddressSelection selection, String value) onChanged;
  final Future<void> Function(AddressSelection selection, String value)
  onSubmitted;
  final ValueChanged<AddressSelection> onMapSelectionRequested;
  final ValueChanged<AddressSelection> onCleared;

  @override
  Widget build(BuildContext context) {
    final needsSelection = controller.text.trim().isNotEmpty && !selected;
    final highlightColor = needsSelection
        ? const Color(0xFFFFE9D0)
        : active
        ? const Color(0xFFFFF9DA)
        : Colors.transparent;
    final textColor = needsSelection
        ? const Color(0xFF9A4F00)
        : const Color(0xFF1F1F1F);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      color: highlightColor,
      padding: const EdgeInsets.fromLTRB(12, 0, 2, 0),
      child: Row(
        children: [
          Icon(icon, size: 18, color: textColor),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              textInputAction: TextInputAction.search,
              onTap: () => onActivated(selection),
              onChanged: (value) => onChanged(selection, value),
              onSubmitted: (value) => onSubmitted(selection, value),
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w700,
                fontSize: 15,
                color: textColor,
              ),
              decoration: InputDecoration(
                labelText: needsSelection
                    ? 'Выберите адрес из подсказок'
                    : label,
                hintText: 'Введите адрес',
                isDense: true,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: const EdgeInsets.symmetric(vertical: 5),
                labelStyle: TextStyle(fontSize: 12, color: textColor),
              ),
            ),
          ),
          if (resolving)
            const Padding(
              padding: EdgeInsets.all(9),
              child: SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else ...[
            IconButton(
              tooltip: 'Указать на карте',
              onPressed: () => onMapSelectionRequested(selection),
              icon: const Icon(Icons.map_outlined, size: 19),
              visualDensity: VisualDensity.compact,
              constraints: const BoxConstraints.tightFor(width: 36, height: 36),
              padding: const EdgeInsets.all(8),
            ),
            if (controller.text.isNotEmpty)
              IconButton(
                tooltip: 'Очистить адрес',
                onPressed: () => onCleared(selection),
                icon: const Icon(Icons.close, size: 18),
                visualDensity: VisualDensity.compact,
                constraints: const BoxConstraints.tightFor(
                  width: 36,
                  height: 36,
                ),
                padding: const EdgeInsets.all(8),
              ),
          ],
        ],
      ),
    );
  }
}

class _ModeSelector extends StatelessWidget {
  const _ModeSelector({required this.kind, required this.onChanged});

  final RideKind kind;
  final ValueChanged<RideKind> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _ModeTile(
            selected: kind == RideKind.taxi,
            icon: Icons.local_taxi,
            title: 'Такси',
            subtitle: 'поездка',
            onTap: () => onChanged(RideKind.taxi),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _ModeTile(
            selected: false,
            icon: Icons.inventory_2,
            title: 'Доставка',
            subtitle: 'скоро',
            enabled: false,
            onTap: () {},
          ),
        ),
      ],
    );
  }
}

class _ModeTile extends StatelessWidget {
  const _ModeTile({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: enabled ? onTap : null,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFFFF1A8) : const Color(0xFFF6F5F0),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? const Color(0xFFFFCC00) : const Color(0xFFE7E1D2),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Icon(
                icon,
                color: enabled
                    ? const Color(0xFF1F1F1F)
                    : const Color(0xFFAAA79E),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: enabled ? null : const Color(0xFFAAA79E),
                      ),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF77746B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PassengerSelector extends StatelessWidget {
  const _PassengerSelector({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<int>(
      showSelectedIcon: false,
      segments: const [
        ButtonSegment(value: 1, icon: Icon(Icons.person), label: Text('1')),
        ButtonSegment(value: 2, icon: Icon(Icons.people), label: Text('2')),
        ButtonSegment(value: 3, icon: Icon(Icons.groups), label: Text('3+')),
      ],
      selected: {value},
      onSelectionChanged: (values) => onChanged(values.first),
    );
  }
}

class _TripOptions extends StatelessWidget {
  const _TripOptions({
    required this.paymentMethod,
    required this.roundTrip,
    required this.scheduled,
    required this.tripTime,
    required this.onPaymentChanged,
    required this.onRoundTripChanged,
    required this.onTripTimeTap,
    required this.onTripTimeClear,
  });

  final PaymentMethod paymentMethod;
  final bool roundTrip;
  final bool scheduled;
  final DateTime tripTime;
  final ValueChanged<PaymentMethod> onPaymentChanged;
  final ValueChanged<bool> onRoundTripChanged;
  final VoidCallback onTripTimeTap;
  final VoidCallback onTripTimeClear;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SegmentedButton<PaymentMethod>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(
              value: PaymentMethod.cash,
              icon: Icon(Icons.payments),
              label: Text('Нал'),
            ),
            ButtonSegment(
              value: PaymentMethod.transfer,
              icon: Icon(Icons.qr_code_2),
              label: Text('Перевод'),
            ),
          ],
          selected: {paymentMethod},
          onSelectionChanged: (values) => onPaymentChanged(values.first),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: scheduled
                  ? _SelectedTimeButton(
                      title: _formatTime(tripTime),
                      onTap: onTripTimeTap,
                      onClear: onTripTimeClear,
                    )
                  : _OptionButton(
                      icon: Icons.schedule_outlined,
                      title: 'На время',
                      onTap: onTripTimeTap,
                    ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _OptionButton(
                icon: Icons.sync_alt,
                title: roundTrip ? 'Туда-обратно' : 'В одну сторону',
                onTap: () => onRoundTripChanged(!roundTrip),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18),
        label: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
    );
  }
}

class _SelectedTimeButton extends StatelessWidget {
  const _SelectedTimeButton({
    required this.title,
    required this.onTap,
    required this.onClear,
  });

  final String title;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(8),
              ),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Row(
                  children: [
                    const Icon(Icons.schedule_outlined, size: 18),
                    const SizedBox(width: 8),
                    Text(title),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Удалить время',
            onPressed: onClear,
            icon: const Icon(Icons.close, size: 19),
          ),
        ],
      ),
    );
  }
}

class _RouteLine extends StatelessWidget {
  const _RouteLine({required this.preview});

  final RoutePreview preview;

  @override
  Widget build(BuildContext context) {
    final (icon, title, subtitle, loading) = switch (preview.status) {
      RoutePreviewStatus.loading => (
        Icons.route_outlined,
        'Строим маршрут',
        'Проверяем дороги',
        true,
      ),
      RoutePreviewStatus.ready => (
        Icons.route,
        '${preview.durationText} · ${preview.distanceText}',
        'Расчётное время в пути',
        false,
      ),
      RoutePreviewStatus.unavailable => (
        Icons.warning_amber_rounded,
        'Маршрут не найден',
        'Заказ всё ещё можно оформить',
        false,
      ),
      RoutePreviewStatus.idle => (Icons.route_outlined, '', '', false),
    };

    return DecoratedBox(
      key: const Key('route-preview'),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F6FF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFD8E3FF)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            SizedBox.square(
              dimension: 34,
              child: Center(
                child: loading
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.5),
                      )
                    : Icon(icon, color: const Color(0xFF2B67F6), size: 23),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    key: const Key('route-preview-title'),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: const Color(0xFF1F1F1F),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF666A73),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FareLine extends StatelessWidget {
  const _FareLine({required this.tariff});

  final TariffBreakdown tariff;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F1F),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            const Icon(Icons.receipt_long, color: Color(0xFFFFCC00)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                tariff.isDistanceBased
                    ? '${tariff.distanceRatePerKm ?? 60} ₽/км · ${_distanceText(tariff.routeDistanceMeters)}'
                    : '${tariff.period.title} тариф',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Text(
              '${tariff.total} ₽',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _distanceText(double? meters) {
    if (meters == null) {
      return 'по расстоянию';
    }
    final kilometers = meters / 1000;
    return kilometers >= 10
        ? '${kilometers.toStringAsFixed(0)} км'
        : '${kilometers.toStringAsFixed(1).replaceFirst('.', ',')} км';
  }
}

class _PassengerLocationNotice extends StatelessWidget {
  const _PassengerLocationNotice({
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
      elevation: 3,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 250),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.location_disabled, size: 19),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                TextButton(
                  onPressed: onTap,
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF1F1F1F),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    actionLabel,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
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
      borderRadius: BorderRadius.circular(22),
      elevation: 4,
      shadowColor: const Color(0x22000000),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon),
      ),
    );
  }
}

class _BrandPill extends StatelessWidget {
  const _BrandPill();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 14,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: const BoxDecoration(
                color: Color(0xFFFFCC00),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Такси Бгр',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}
