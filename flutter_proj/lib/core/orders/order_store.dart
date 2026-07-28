import 'package:flutter/foundation.dart';

import '../auth/auth_controller.dart';
import '../driver_work/driver_work_api_client.dart';
import '../driver_work/driver_work_models.dart';
import '../finance/driver_finance_api_client.dart';
import '../finance/finance_models.dart';
import '../models/taxi_order.dart';
import '../network/api_exception.dart';
import '../data/local_catalog.dart';
import '../services/tariff_calculator.dart';
import 'driver_availability.dart';
import 'order_api_client.dart';
import 'order_quote.dart';

class OrderStore extends ChangeNotifier {
  OrderStore({
    required this.api,
    required this.driverWorkApi,
    required this.driverFinanceApi,
    required this.auth,
  });

  final OrderApiClient api;
  final DriverWorkApiClient driverWorkApi;
  final DriverFinanceApiClient driverFinanceApi;
  final AuthController auth;

  List<TaxiOrder> _openOrders = const [];
  List<TaxiOrder> _scheduledDriverOrders = const [];
  String _boardAnnouncement = '';
  TaxiOrder? _activeDriverOrder;
  TaxiOrder? _activePassengerOrder;
  DriverWorkState? _driverWorkState;
  DriverPaymentDetails? _driverPaymentDetails;
  TransferPaymentDetails? _passengerTransferDetails;
  bool _loading = false;
  String? _errorMessage;
  List<DriverSurvey> _dueDriverSurveys = const [];
  bool _localSurveyAnswered = false;

  List<TaxiOrder> get openOrders => _openOrders;
  List<TaxiOrder> get scheduledDriverOrders => _scheduledDriverOrders;
  bool get hasImminentReservation => _scheduledDriverOrders.any(
    (order) =>
        order.tripTime.difference(DateTime.now()) <= const Duration(minutes: 5),
  );
  String get boardAnnouncement => _boardAnnouncement;
  TaxiOrder? get activeDriverOrder => _activeDriverOrder;
  TaxiOrder? get activePassengerOrder => _activePassengerOrder;
  DriverWorkState? get driverWorkState => _driverWorkState;
  DriverPaymentDetails? get driverPaymentDetails => _driverPaymentDetails;
  TransferPaymentDetails? get passengerTransferDetails =>
      _passengerTransferDetails;
  bool get isDriverWorking => _driverWorkState?.isWorking ?? false;
  bool get isDriverOnBreak => _driverWorkState?.isOnBreak ?? false;
  double get driverDebt => _driverWorkState?.commissionDebt ?? 0;
  double get driverEarnings24h => _driverWorkState?.earnings24h ?? 0;
  bool get loading => _loading;
  String? get errorMessage => _errorMessage;
  List<DriverSurvey> get dueDriverSurveys => _dueDriverSurveys;

  bool get isLocalDevelopment =>
      auth.session?.accessToken.startsWith('local-dev-') ?? false;

  void resetForAccountSwitch() {
    _openOrders = const [];
    _scheduledDriverOrders = const [];
    _boardAnnouncement = '';
    _activeDriverOrder = null;
    _activePassengerOrder = null;
    _driverWorkState = null;
    _driverPaymentDetails = null;
    _passengerTransferDetails = null;
    _loading = false;
    _errorMessage = null;
    _dueDriverSurveys = const [];
    _localSurveyAnswered = false;
    notifyListeners();
  }

  Future<OrderQuote> quoteOrder(TaxiOrder draft) {
    if (isLocalDevelopment) {
      final calculation = const TariffCalculator().calculate(
        from: draft.from,
        to: draft.to,
        createdAt: draft.createdAt,
        tripTime: draft.tripTime,
        scheduled: draft.scheduled,
        roundTrip: draft.roundTrip,
        roadSurchargeActive: false,
        routeDistanceMeters: draft.routeDistanceMeters?.toDouble(),
      );
      return Future.value(
        OrderQuote(
          fare: calculation.total,
          pricingMode: calculation.isDistanceBased
              ? OrderPricingMode.distance
              : OrderPricingMode.fixed,
          routeDistanceMeters: calculation.routeDistanceMeters?.round(),
          distanceRatePerKm: calculation.distanceRatePerKm,
        ),
      );
    }
    return _run(
      () => auth.authorizedRequest((token) => api.quoteOrder(token, draft)),
    );
  }

  Future<DriverAvailability> getDriverAvailability(RideKind kind) {
    if (isLocalDevelopment) {
      return Future.value(
        const DriverAvailability(
          availableDrivers: 1,
          hasAvailableDrivers: true,
          waitMinutes: 0,
        ),
      );
    }
    return _run(
      () => auth.authorizedRequest(
        (token) => api.getDriverAvailability(token, kind),
      ),
      showLoading: false,
    );
  }

  Future<TaxiOrder> createOrder(TaxiOrder draft) async {
    if (isLocalDevelopment) {
      final quote = await quoteOrder(draft);
      final created = draft.copyWith(
        status: OrderStatus.open,
        fare: quote.fare,
        pricingMode: quote.pricingMode,
        routeDistanceMeters: quote.routeDistanceMeters,
        distanceRatePerKm: quote.distanceRatePerKm,
      );
      _activePassengerOrder = TaxiOrder(
        id: 'local-order-${DateTime.now().millisecondsSinceEpoch}',
        from: created.from,
        to: created.to,
        kind: created.kind,
        paymentMethod: created.paymentMethod,
        passengers: created.passengers,
        roundTrip: created.roundTrip,
        scheduled: created.scheduled,
        createdAt: created.createdAt,
        tripTime: created.tripTime,
        fare: created.fare,
        pricingMode: created.pricingMode,
        routeDistanceMeters: created.routeDistanceMeters,
        distanceRatePerKm: created.distanceRatePerKm,
      );
      _passengerTransferDetails = null;
      notifyListeners();
      return _activePassengerOrder!;
    }
    return _run(() async {
      final created = await auth.authorizedRequest(
        (token) => api.createOrder(token, draft),
      );
      _activePassengerOrder = created;
      _passengerTransferDetails = null;
      return created;
    });
  }

  Future<void> loadPassengerActive() async {
    if (isLocalDevelopment) {
      return;
    }
    await _run(() async {
      _activePassengerOrder = await auth.authorizedRequest(api.getActive);
      await _refreshPassengerTransferDetails();
    });
  }

  Future<void> refreshPassengerActive() async {
    if (isLocalDevelopment) {
      return;
    }
    await _run(() async {
      _activePassengerOrder = await auth.authorizedRequest(api.getActive);
      await _refreshPassengerTransferDetails();
    }, showLoading: false);
  }

  Future<void> loadDriverState() async {
    if (isLocalDevelopment) {
      _driverWorkState = _localWorkState(DriverLineStatus.offline);
      _driverPaymentDetails = const DriverPaymentDetails(
        transferPhone: '+79141234567',
        transferBank: 'СберБанк',
        configured: true,
      );
      _openOrders = _localOrders();
      _scheduledDriverOrders = const [];
      _boardAnnouncement =
          'Проверяйте адрес и способ оплаты перед принятием заказа.';
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(driverWorkApi.getState);
      _driverPaymentDetails = await auth.authorizedRequest(
        driverFinanceApi.getPaymentDetails,
      );
      final activeAndReservations = await Future.wait<Object?>([
        auth.authorizedRequest(api.getActive),
        auth.authorizedRequest(api.getReservations),
      ]);
      _activeDriverOrder = activeAndReservations[0] as TaxiOrder?;
      _scheduledDriverOrders = activeAndReservations[1] as List<TaxiOrder>;
      if (_driverWorkState?.status == DriverLineStatus.online) {
        _openOrders = await _loadBoardFromServer();
      } else {
        _openOrders = const [];
      }
    });
  }

  Future<void> loadDueDriverSurveys() async {
    if (isLocalDevelopment) {
      _dueDriverSurveys = _localSurveyAnswered
          ? const []
          : const [
              DriverSurvey(
                type: DriverSurveyType.price,
                question: 'Устраивают ли вас текущие цены на поездки?',
                answers: [
                  DriverSurveyAnswer.satisfied,
                  DriverSurveyAnswer.notSatisfied,
                ],
                allowSuggestion: true,
              ),
            ];
      notifyListeners();
      return;
    }
    await _run(() async {
      _dueDriverSurveys = await auth.authorizedRequest(
        driverWorkApi.getDueSurveys,
      );
    }, showLoading: false);
  }

  Future<void> submitDriverSurvey(
    DriverSurvey survey,
    DriverSurveyAnswer answer, {
    String? suggestion,
  }) async {
    if (isLocalDevelopment) {
      _localSurveyAnswered = true;
      _dueDriverSurveys = const [];
      notifyListeners();
      return;
    }
    await _run(() async {
      await auth.authorizedRequest(
        (token) => driverWorkApi.submitSurvey(
          token,
          survey,
          answer,
          suggestion: suggestion,
        ),
      );
      _dueDriverSurveys = _dueDriverSurveys
          .where((item) => item != survey)
          .toList(growable: false);
    }, showLoading: false);
  }

  Future<void> refreshBoard() async {
    if (isLocalDevelopment) {
      notifyListeners();
      return;
    }
    if (_driverWorkState?.status != DriverLineStatus.online) {
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(driverWorkApi.getState);
      if (_driverWorkState?.status == DriverLineStatus.online) {
        _openOrders = await _loadBoardFromServer();
        _scheduledDriverOrders = await auth.authorizedRequest(
          api.getReservations,
        );
      }
    }, showLoading: false);
  }

  Future<void> startDriverShift() async {
    if (isLocalDevelopment) {
      _driverWorkState = _localWorkState(DriverLineStatus.online);
      _openOrders = _activeDriverOrder == null ? _localOrders() : const [];
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(driverWorkApi.start);
      // Show the successful shift start immediately; the board can load in
      // parallel with the active-order check on a remote server.
      notifyListeners();
      final results = await Future.wait<Object?>([
        auth.authorizedRequest(api.getActive),
        _loadBoardFromServer(),
        auth.authorizedRequest(api.getReservations),
      ]);
      _activeDriverOrder = results[0] as TaxiOrder?;
      _openOrders = results[1] as List<TaxiOrder>;
      _scheduledDriverOrders = results[2] as List<TaxiOrder>;
    });
  }

  Future<void> endDriverShift() async {
    if (isLocalDevelopment) {
      _driverWorkState = _localWorkState(DriverLineStatus.offline);
      _openOrders = const [];
      _scheduledDriverOrders = const [];
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(driverWorkApi.end);
      _openOrders = const [];
    });
  }

  Future<void> startDriverBreak(int minutes) async {
    if (isLocalDevelopment) {
      _driverWorkState = _localWorkState(
        DriverLineStatus.onBreak,
        breakUntil: DateTime.now().add(Duration(minutes: minutes)),
      );
      _openOrders = const [];
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(
        (token) => driverWorkApi.startBreak(token, minutes),
      );
      _openOrders = const [];
    });
  }

  Future<void> resumeDriverShift() async {
    if (isLocalDevelopment) {
      _driverWorkState = _localWorkState(DriverLineStatus.online);
      _openOrders = _activeDriverOrder == null ? _localOrders() : const [];
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(driverWorkApi.resume);
      _openOrders = await _loadBoardFromServer();
    });
  }

  Future<void> updateDriverSettings({
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  }) async {
    if (isLocalDevelopment) {
      final state =
          _driverWorkState ?? _localWorkState(DriverLineStatus.offline);
      _driverWorkState = DriverWorkState(
        status: state.status,
        shiftId: state.shiftId,
        startedAt: state.startedAt,
        breakUntil: state.breakUntil,
        earnings24h: state.earnings24h,
        commissionDebt: state.commissionDebt,
        commissionDebtStatus: state.commissionDebtStatus,
        visibilityDelaySeconds: state.visibilityDelaySeconds,
        settings: state.settings.copyWith(
          acceptsTaxi: acceptsTaxi,
          acceptsDelivery: acceptsDelivery,
          backgroundNotifications: backgroundNotifications,
          nightNotifications: nightNotifications,
        ),
      );
      notifyListeners();
      return;
    }
    await _run(() async {
      _driverWorkState = await auth.authorizedRequest(
        (token) => driverWorkApi.updateSettings(
          token,
          acceptsTaxi: acceptsTaxi,
          acceptsDelivery: acceptsDelivery,
          backgroundNotifications: backgroundNotifications,
          nightNotifications: nightNotifications,
        ),
      );
      if (_driverWorkState?.status == DriverLineStatus.online &&
          _activeDriverOrder == null) {
        _openOrders = await _loadBoardFromServer();
      }
    });
  }

  Future<DriverPaymentDetails> updateDriverPaymentDetails({
    required String transferPhone,
    required String transferBank,
  }) async {
    if (isLocalDevelopment) {
      _driverPaymentDetails = DriverPaymentDetails(
        transferPhone: transferPhone.trim(),
        transferBank: transferBank.trim(),
        configured: true,
      );
      notifyListeners();
      return _driverPaymentDetails!;
    }
    return _run(() async {
      final saved = await auth.authorizedRequest(
        (token) => driverFinanceApi.updatePaymentDetails(
          token,
          transferPhone: transferPhone.trim(),
          transferBank: transferBank.trim(),
        ),
      );
      _driverPaymentDetails = saved;
      return saved;
    });
  }

  Future<void> acceptOrder(String orderId) async {
    if (isLocalDevelopment) {
      final order = _openOrders.where((item) => item.id == orderId).firstOrNull;
      if (order == null) {
        throw const ApiException(message: 'Заказ уже недоступен');
      }
      _activeDriverOrder = order.copyWith(status: OrderStatus.accepted);
      _openOrders = _openOrders
          .where((item) => item.id != orderId)
          .toList(growable: false);
      notifyListeners();
      return;
    }
    await _run(() async {
      final accepted = await auth.authorizedRequest(
        (token) => api.acceptOrder(token, orderId),
      );
      final futureReservation =
          accepted.scheduled &&
          accepted.tripTime.difference(DateTime.now()) >
              const Duration(minutes: 5);
      if (futureReservation) {
        _scheduledDriverOrders = [
          ..._scheduledDriverOrders.where((item) => item.id != accepted.id),
          accepted,
        ]..sort((a, b) => a.tripTime.compareTo(b.tripTime));
      } else {
        _activeDriverOrder = accepted;
      }
      _openOrders = _openOrders
          .where((item) => item.id != accepted.id)
          .toList(growable: false);
    });
  }

  Future<void> updateActiveStatus(OrderStatus status) async {
    final active = _activeDriverOrder;
    if (active == null) {
      return;
    }
    if (isLocalDevelopment) {
      _activeDriverOrder = status == OrderStatus.completed
          ? null
          : active.copyWith(status: status);
      if (status == OrderStatus.completed) {
        _driverWorkState = _localWorkState(DriverLineStatus.online);
        _openOrders = _localOrders();
      }
      notifyListeners();
      return;
    }
    await _run(() async {
      final updated = await auth.authorizedRequest(
        (token) => api.updateStatus(token, active.id, status),
      );
      if (status == OrderStatus.completed) {
        _activeDriverOrder = null;
        _driverWorkState = await auth.authorizedRequest(driverWorkApi.getState);
        _openOrders = await _loadBoardFromServer();
        _scheduledDriverOrders = await auth.authorizedRequest(
          api.getReservations,
        );
      } else {
        _activeDriverOrder = updated;
      }
    });
  }

  Future<void> cancelActiveOrder(String reason, {String? reasonCode}) async {
    final active = _activeDriverOrder;
    if (active == null) {
      return;
    }
    if (isLocalDevelopment) {
      _activeDriverOrder = null;
      _openOrders = _localOrders();
      notifyListeners();
      return;
    }
    await _run(() async {
      await auth.authorizedRequest(
        (token) =>
            api.cancelOrder(token, active.id, reason, reasonCode: reasonCode),
      );
      _activeDriverOrder = null;
      _openOrders = await _loadBoardFromServer();
    });
  }

  Future<TaxiOrder?> cancelPassengerOrder(String reason) async {
    final active = _activePassengerOrder;
    if (active == null) {
      return null;
    }
    if (isLocalDevelopment) {
      final canceled = active.copyWith(status: OrderStatus.canceled);
      _activePassengerOrder = null;
      _passengerTransferDetails = null;
      notifyListeners();
      return canceled;
    }
    return _run(() async {
      final canceled = await auth.authorizedRequest(
        (token) => api.cancelOrder(token, active.id, reason),
      );
      _activePassengerOrder = null;
      _passengerTransferDetails = null;
      return canceled;
    });
  }

  void clearError() {
    if (_errorMessage != null) {
      _errorMessage = null;
      notifyListeners();
    }
  }

  Future<void> _refreshPassengerTransferDetails() async {
    final active = _activePassengerOrder;
    if (active == null ||
        active.paymentMethod != PaymentMethod.transfer ||
        active.driverName == null) {
      _passengerTransferDetails = null;
      return;
    }
    try {
      _passengerTransferDetails = await auth.authorizedRequest(
        (token) => api.getTransferDetails(token, active.id),
      );
    } on ApiException catch (error) {
      if (error.code == 'TRANSFER_DETAILS_NOT_READY') {
        _passengerTransferDetails = null;
        return;
      }
      rethrow;
    }
  }

  Future<List<TaxiOrder>> _loadBoardFromServer() async {
    final board = await auth.authorizedRequest(api.getBoard);
    _boardAnnouncement = board.announcement;
    _scheduledDriverOrders = board.reservations;
    return board.orders;
  }

  Future<T> _run<T>(
    Future<T> Function() operation, {
    bool showLoading = true,
  }) async {
    if (showLoading) {
      _loading = true;
    }
    _errorMessage = null;
    notifyListeners();
    try {
      return await operation();
    } on ApiException catch (error) {
      _errorMessage = error.message;
      rethrow;
    } finally {
      if (showLoading) {
        _loading = false;
      }
      notifyListeners();
    }
  }

  DriverWorkState _localWorkState(
    DriverLineStatus status, {
    DateTime? breakUntil,
  }) {
    return DriverWorkState(
      status: status,
      shiftId: status == DriverLineStatus.offline ? null : 'local-shift',
      startedAt: status == DriverLineStatus.offline ? null : DateTime.now(),
      breakUntil: breakUntil,
      earnings24h: 1850,
      commissionDebt: 0,
      commissionDebtStatus: 'clear',
      visibilityDelaySeconds: 0,
      settings:
          _driverWorkState?.settings ??
          const DriverWorkSettings(
            acceptsTaxi: true,
            acceptsDelivery: true,
            backgroundNotifications: true,
            nightNotifications: false,
          ),
    );
  }

  List<TaxiOrder> _localOrders() {
    final now = DateTime.now();
    return [
      TaxiOrder(
        id: 'local-taxi-order',
        from: localAddressCatalog[0],
        to: localAddressCatalog[2],
        kind: RideKind.taxi,
        paymentMethod: PaymentMethod.cash,
        passengers: 2,
        roundTrip: false,
        scheduled: false,
        createdAt: now.subtract(const Duration(minutes: 2)),
        tripTime: now,
        fare: 200,
      ),
      TaxiOrder(
        id: 'local-delivery-order',
        from: localAddressCatalog[1],
        to: localAddressCatalog[3],
        kind: RideKind.delivery,
        paymentMethod: PaymentMethod.transfer,
        passengers: 1,
        roundTrip: false,
        scheduled: false,
        createdAt: now.subtract(const Duration(minutes: 5)),
        tripTime: now,
        fare: 250,
      ),
    ];
  }
}
