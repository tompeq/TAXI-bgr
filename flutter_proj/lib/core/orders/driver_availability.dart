class DriverAvailability {
  const DriverAvailability({
    required this.availableDrivers,
    required this.hasAvailableDrivers,
    required this.waitMinutes,
  });

  final int availableDrivers;
  final bool hasAvailableDrivers;
  final int waitMinutes;

  factory DriverAvailability.fromJson(Map<String, dynamic> json) {
    return DriverAvailability(
      availableDrivers: (json['availableDrivers'] as num?)?.toInt() ?? 0,
      hasAvailableDrivers: json['hasAvailableDrivers'] as bool? ?? false,
      waitMinutes: (json['waitMinutes'] as num?)?.toInt() ?? 0,
    );
  }
}
