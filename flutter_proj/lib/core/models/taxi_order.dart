import 'address_point.dart';
import 'geo_point.dart';

enum RideKind { taxi, delivery, companion }

extension RideKindText on RideKind {
  String get wireName {
    return switch (this) {
      RideKind.taxi => 'taxi',
      RideKind.delivery => 'delivery',
      RideKind.companion => 'companion',
    };
  }

  String get title {
    return switch (this) {
      RideKind.taxi => 'Такси',
      RideKind.delivery => 'Доставка',
      RideKind.companion => 'Попутчик',
    };
  }
}

enum PaymentMethod { cash, transfer }

extension PaymentMethodText on PaymentMethod {
  String get wireName {
    return switch (this) {
      PaymentMethod.cash => 'cash',
      PaymentMethod.transfer => 'transfer',
    };
  }

  String get title {
    return switch (this) {
      PaymentMethod.cash => 'Наличные',
      PaymentMethod.transfer => 'Перевод',
    };
  }
}

enum OrderPricingMode { fixed, distance }

OrderPricingMode orderPricingModeFromWire(String value) {
  return switch (value) {
    'fixed' => OrderPricingMode.fixed,
    'distance' => OrderPricingMode.distance,
    _ => throw FormatException('Unknown order pricing mode: $value'),
  };
}

enum OrderStatus {
  open,
  accepted,
  driverEnRoute,
  arrived,
  started,
  waiting,
  completed,
  canceled,
}

extension OrderStatusText on OrderStatus {
  String get wireName {
    return switch (this) {
      OrderStatus.open => 'open',
      OrderStatus.accepted => 'accepted',
      OrderStatus.driverEnRoute => 'driver_en_route',
      OrderStatus.arrived => 'arrived',
      OrderStatus.started => 'started',
      OrderStatus.waiting => 'waiting',
      OrderStatus.completed => 'completed',
      OrderStatus.canceled => 'canceled',
    };
  }

  String get title {
    return switch (this) {
      OrderStatus.open => 'На доске',
      OrderStatus.accepted => 'Принят',
      OrderStatus.driverEnRoute => 'Водитель едет',
      OrderStatus.arrived => 'Водитель прибыл',
      OrderStatus.started => 'Поездка началась',
      OrderStatus.waiting => 'Ожидание',
      OrderStatus.completed => 'Завершен',
      OrderStatus.canceled => 'Отменен',
    };
  }
}

class DriverVehicle {
  const DriverVehicle({
    required this.makeModel,
    required this.color,
    required this.plate,
  });

  final String? makeModel;
  final String? color;
  final String? plate;

  bool get hasDetails =>
      makeModel?.isNotEmpty == true ||
      color?.isNotEmpty == true ||
      plate?.isNotEmpty == true;

  factory DriverVehicle.fromJson(Map<String, dynamic> json) {
    return DriverVehicle(
      makeModel: json['makeModel'] as String?,
      color: json['color'] as String?,
      plate: json['plate'] as String?,
    );
  }
}

class TaxiOrder {
  const TaxiOrder({
    required this.id,
    required this.from,
    required this.to,
    required this.kind,
    required this.paymentMethod,
    required this.passengers,
    required this.roundTrip,
    required this.scheduled,
    required this.createdAt,
    required this.tripTime,
    required this.fare,
    this.status = OrderStatus.open,
    this.pricingMode = OrderPricingMode.fixed,
    this.routeDistanceMeters,
    this.distanceRatePerKm,
    this.driverComment,
    this.cancellationFee = 0,
    this.passengerName,
    this.driverName,
    this.driverVehicle,
  });

  final String id;
  final AddressPoint from;
  final AddressPoint to;
  final RideKind kind;
  final PaymentMethod paymentMethod;
  final int passengers;
  final bool roundTrip;
  final bool scheduled;
  final DateTime createdAt;
  final DateTime tripTime;
  final int fare;
  final OrderStatus status;
  final OrderPricingMode pricingMode;
  final int? routeDistanceMeters;
  final int? distanceRatePerKm;
  final String? driverComment;
  final int cancellationFee;
  final String? passengerName;
  final String? driverName;
  final DriverVehicle? driverVehicle;

  factory TaxiOrder.fromJson(Map<String, dynamic> json) {
    final createdAt = DateTime.parse(json['createdAt'] as String).toLocal();
    final scheduledValue = json['scheduledFor'] as String?;
    final scheduledFor = scheduledValue == null
        ? null
        : DateTime.parse(scheduledValue).toLocal();
    final driver = json['driver'] as Map<String, dynamic>?;
    final vehicle = driver?['vehicle'] as Map<String, dynamic>?;
    return TaxiOrder(
      id: json['id'] as String,
      from: _addressFromJson(json['pickup'] as Map<String, dynamic>, 'pickup'),
      to: _addressFromJson(
        json['destination'] as Map<String, dynamic>,
        'destination',
      ),
      kind: _rideKindFromWire(json['kind'] as String),
      paymentMethod: _paymentMethodFromWire(json['paymentMethod'] as String),
      passengers: json['passengerCount'] as int,
      roundTrip: json['roundTrip'] as bool,
      scheduled: scheduledFor != null,
      createdAt: createdAt,
      tripTime: scheduledFor ?? createdAt,
      fare: json['fareAmount'] as int,
      status: _orderStatusFromWire(json['status'] as String),
      pricingMode: orderPricingModeFromWire(
        json['pricingMode'] as String? ?? 'fixed',
      ),
      routeDistanceMeters: (json['routeDistanceMeters'] as num?)?.toInt(),
      distanceRatePerKm: (json['distanceRatePerKm'] as num?)?.toInt(),
      driverComment: json['cancellationReason'] as String?,
      cancellationFee: json['cancellationFeeAmount'] as int? ?? 0,
      passengerName:
          (json['passenger'] as Map<String, dynamic>?)?['name'] as String?,
      driverName: driver?['name'] as String?,
      driverVehicle: vehicle == null ? null : DriverVehicle.fromJson(vehicle),
    );
  }

  Map<String, dynamic> toCreateJson() {
    return {
      'pickup': {
        'address': from.title,
        'latitude': from.coordinates.latitude,
        'longitude': from.coordinates.longitude,
      },
      'destination': {
        'address': to.title,
        'latitude': to.coordinates.latitude,
        'longitude': to.coordinates.longitude,
      },
      'kind': kind.wireName,
      'paymentMethod': paymentMethod.wireName,
      'passengerCount': passengers,
      'roundTrip': roundTrip,
      if (routeDistanceMeters != null)
        'routeDistanceMeters': routeDistanceMeters,
      if (scheduled) 'scheduledFor': tripTime.toUtc().toIso8601String(),
    };
  }

  TaxiOrder copyWith({
    AddressPoint? from,
    AddressPoint? to,
    RideKind? kind,
    PaymentMethod? paymentMethod,
    int? passengers,
    bool? roundTrip,
    bool? scheduled,
    DateTime? createdAt,
    DateTime? tripTime,
    int? fare,
    OrderStatus? status,
    OrderPricingMode? pricingMode,
    int? routeDistanceMeters,
    int? distanceRatePerKm,
    String? driverComment,
    int? cancellationFee,
    String? passengerName,
    String? driverName,
    DriverVehicle? driverVehicle,
  }) {
    return TaxiOrder(
      id: id,
      from: from ?? this.from,
      to: to ?? this.to,
      kind: kind ?? this.kind,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      passengers: passengers ?? this.passengers,
      roundTrip: roundTrip ?? this.roundTrip,
      scheduled: scheduled ?? this.scheduled,
      createdAt: createdAt ?? this.createdAt,
      tripTime: tripTime ?? this.tripTime,
      fare: fare ?? this.fare,
      status: status ?? this.status,
      pricingMode: pricingMode ?? this.pricingMode,
      routeDistanceMeters: routeDistanceMeters ?? this.routeDistanceMeters,
      distanceRatePerKm: distanceRatePerKm ?? this.distanceRatePerKm,
      driverComment: driverComment ?? this.driverComment,
      cancellationFee: cancellationFee ?? this.cancellationFee,
      passengerName: passengerName ?? this.passengerName,
      driverName: driverName ?? this.driverName,
      driverVehicle: driverVehicle ?? this.driverVehicle,
    );
  }
}

AddressPoint _addressFromJson(Map<String, dynamic> json, String fallbackId) {
  final zone = _serviceZoneFromWire(json['zone'] as String);
  return AddressPoint(
    id: '$fallbackId-${json['latitude']}-${json['longitude']}',
    title: json['address'] as String,
    subtitle: zone.title,
    zone: zone,
    coordinates: GeoPoint(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
    ),
  );
}

RideKind _rideKindFromWire(String value) {
  return switch (value) {
    'taxi' => RideKind.taxi,
    'delivery' => RideKind.delivery,
    'companion' => RideKind.companion,
    _ => throw FormatException('Unknown ride kind: $value'),
  };
}

PaymentMethod _paymentMethodFromWire(String value) {
  return switch (value) {
    'cash' => PaymentMethod.cash,
    'transfer' => PaymentMethod.transfer,
    _ => throw FormatException('Unknown payment method: $value'),
  };
}

OrderStatus _orderStatusFromWire(String value) {
  return switch (value) {
    'open' => OrderStatus.open,
    'accepted' => OrderStatus.accepted,
    'driver_en_route' => OrderStatus.driverEnRoute,
    'arrived' => OrderStatus.arrived,
    'started' => OrderStatus.started,
    'waiting' => OrderStatus.waiting,
    'completed' => OrderStatus.completed,
    'canceled' => OrderStatus.canceled,
    _ => throw FormatException('Unknown order status: $value'),
  };
}

ServiceZone _serviceZoneFromWire(String value) {
  return switch (value) {
    'upper_bgr' => ServiceZone.upperBgr,
    'kombinat' => ServiceZone.kombinat,
    'lower_harbor' => ServiceZone.lowerHarbor,
    'quarry' => ServiceZone.quarry,
    'custom' => ServiceZone.custom,
    _ => throw FormatException('Unknown service zone: $value'),
  };
}
