import '../models/taxi_order.dart';

class OrderQuote {
  const OrderQuote({
    required this.fare,
    required this.pricingMode,
    this.routeDistanceMeters,
    this.distanceRatePerKm,
  });

  final int fare;
  final OrderPricingMode pricingMode;
  final int? routeDistanceMeters;
  final int? distanceRatePerKm;

  factory OrderQuote.fromJson(Map<String, dynamic> json) {
    return OrderQuote(
      fare: json['fareAmount'] as int,
      pricingMode: orderPricingModeFromWire(
        json['pricingMode'] as String? ?? 'fixed',
      ),
      routeDistanceMeters: (json['routeDistanceMeters'] as num?)?.toInt(),
      distanceRatePerKm: (json['distanceRatePerKm'] as num?)?.toInt(),
    );
  }
}
