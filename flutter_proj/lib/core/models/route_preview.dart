enum RoutePreviewStatus { idle, loading, ready, unavailable }

class RoutePreview {
  const RoutePreview._({
    required this.status,
    this.distanceMeters,
    this.duration,
  });

  const RoutePreview.idle() : this._(status: RoutePreviewStatus.idle);

  const RoutePreview.loading() : this._(status: RoutePreviewStatus.loading);

  const RoutePreview.ready({
    required double distanceMeters,
    required Duration duration,
  }) : this._(
         status: RoutePreviewStatus.ready,
         distanceMeters: distanceMeters,
         duration: duration,
       );

  const RoutePreview.unavailable()
    : this._(status: RoutePreviewStatus.unavailable);

  final RoutePreviewStatus status;
  final double? distanceMeters;
  final Duration? duration;

  String get distanceText {
    final meters = distanceMeters;
    if (meters == null) {
      return '';
    }
    if (meters < 1000) {
      final rounded = ((meters / 50).round() * 50).clamp(50, 1000);
      return '$rounded м';
    }

    final kilometers = meters / 1000;
    final value = kilometers >= 10
        ? kilometers.toStringAsFixed(0)
        : kilometers.toStringAsFixed(1).replaceFirst('.', ',');
    return '$value км';
  }

  String get durationText {
    final value = duration;
    if (value == null) {
      return '';
    }

    final minutes = (value.inSeconds / 60).ceil().clamp(1, 24 * 60);
    if (minutes < 60) {
      return '$minutes мин';
    }

    final hours = minutes ~/ 60;
    final remainder = minutes % 60;
    return remainder == 0 ? '$hours ч' : '$hours ч $remainder мин';
  }
}
