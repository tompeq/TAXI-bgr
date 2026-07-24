import '../models/app_role.dart';

class OtpChallenge {
  const OtpChallenge({
    required this.challengeId,
    required this.expiresInSeconds,
    required this.resendAfterSeconds,
    this.debugCode,
  });

  final String challengeId;
  final int expiresInSeconds;
  final int resendAfterSeconds;
  final String? debugCode;

  factory OtpChallenge.fromJson(Map<String, dynamic> json) {
    return OtpChallenge(
      challengeId: json['challengeId'] as String,
      expiresInSeconds: json['expiresInSeconds'] as int,
      resendAfterSeconds: json['resendAfterSeconds'] as int,
      debugCode: json['debugCode'] as String?,
    );
  }
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.phone,
    required this.name,
    required this.role,
    required this.status,
    this.driverVerificationStatus,
    this.driverVerificationComment,
  });

  final String id;
  final String phone;
  final String name;
  final AppRole? role;
  final String status;
  final String? driverVerificationStatus;
  final String? driverVerificationComment;

  bool get isApprovedDriver {
    return role == AppRole.driver &&
        status == 'active' &&
        driverVerificationStatus == 'approved';
  }

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      phone: json['phone'] as String,
      name: json['name'] as String,
      role: switch (json['role']) {
        'passenger' => AppRole.passenger,
        'driver' => AppRole.driver,
        _ => null,
      },
      status: json['status'] as String,
      driverVerificationStatus: json['driverVerificationStatus'] as String?,
      driverVerificationComment: json['driverVerificationComment'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'phone': phone,
      'name': name,
      'role': switch (role) {
        AppRole.passenger => 'passenger',
        AppRole.driver => 'driver',
        null => 'unsupported',
      },
      'status': status,
      if (driverVerificationStatus != null)
        'driverVerificationStatus': driverVerificationStatus,
      if (driverVerificationComment != null)
        'driverVerificationComment': driverVerificationComment,
    };
  }
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresInSeconds,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final int accessTokenExpiresInSeconds;
  final AuthUser user;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      accessTokenExpiresInSeconds: json['accessTokenExpiresInSeconds'] as int,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'accessTokenExpiresInSeconds': accessTokenExpiresInSeconds,
      'user': user.toJson(),
    };
  }

  AuthSession copyWith({AuthUser? user}) {
    return AuthSession(
      accessToken: accessToken,
      refreshToken: refreshToken,
      accessTokenExpiresInSeconds: accessTokenExpiresInSeconds,
      user: user ?? this.user,
    );
  }
}

sealed class OtpVerificationResult {
  const OtpVerificationResult();
}

class ExistingUserAuthenticated extends OtpVerificationResult {
  const ExistingUserAuthenticated(this.session);

  final AuthSession session;
}

class RegistrationRequired extends OtpVerificationResult {
  const RegistrationRequired({
    required this.registrationToken,
    required this.expiresInSeconds,
  });

  final String registrationToken;
  final int expiresInSeconds;
}

enum RegistrationUploadKind {
  avatar('avatar'),
  license('license'),
  licenseBack('license_back'),
  carFront('car_front'),
  carRear('car_rear'),
  carLeft('car_left'),
  carRight('car_right');

  const RegistrationUploadKind(this.wireName);

  final String wireName;
}
