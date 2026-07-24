class DriverPaymentDetails {
  const DriverPaymentDetails({
    required this.transferPhone,
    required this.transferBank,
    required this.configured,
  });

  final String? transferPhone;
  final String? transferBank;
  final bool configured;

  factory DriverPaymentDetails.fromJson(Map<String, dynamic> json) {
    return DriverPaymentDetails(
      transferPhone: json['transferPhone'] as String?,
      transferBank: json['transferBank'] as String?,
      configured: json['configured'] as bool,
    );
  }
}

class TransferPaymentDetails {
  const TransferPaymentDetails({
    required this.driverName,
    required this.transferPhone,
    required this.transferBank,
  });

  final String driverName;
  final String transferPhone;
  final String transferBank;

  factory TransferPaymentDetails.fromJson(Map<String, dynamic> json) {
    return TransferPaymentDetails(
      driverName: json['driverName'] as String,
      transferPhone: json['transferPhone'] as String,
      transferBank: json['transferBank'] as String,
    );
  }
}
