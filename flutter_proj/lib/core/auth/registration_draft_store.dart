import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/app_role.dart';
import 'auth_models.dart';

class RegistrationDraft {
  const RegistrationDraft({
    required this.role,
    required this.registrationToken,
    required this.name,
    required this.savedAtEpochMs,
    this.avatarPath,
    this.licensePath,
    this.licenseBackPath,
    this.vehicleMakeModel = '',
    this.vehicleColor = '',
    this.vehiclePlate = '',
    this.carPhotoPaths = const {},
    this.pendingPhotoKind,
  });

  static const maxAge = Duration(minutes: 30);

  final AppRole role;
  final String registrationToken;
  final String name;
  final int savedAtEpochMs;
  final String? avatarPath;
  final String? licensePath;
  final String? licenseBackPath;
  final String vehicleMakeModel;
  final String vehicleColor;
  final String vehiclePlate;
  final Map<RegistrationUploadKind, String> carPhotoPaths;
  final RegistrationUploadKind? pendingPhotoKind;

  bool get isExpired {
    return DateTime.now().millisecondsSinceEpoch - savedAtEpochMs >
        maxAge.inMilliseconds;
  }

  Map<String, dynamic> toJson() {
    return {
      'role': role.name,
      'registrationToken': registrationToken,
      'name': name,
      'savedAtEpochMs': savedAtEpochMs,
      if (avatarPath != null) 'avatarPath': avatarPath,
      if (licensePath != null) 'licensePath': licensePath,
      if (licenseBackPath != null) 'licenseBackPath': licenseBackPath,
      'vehicleMakeModel': vehicleMakeModel,
      'vehicleColor': vehicleColor,
      'vehiclePlate': vehiclePlate,
      'carPhotoPaths': carPhotoPaths.map(
        (kind, path) => MapEntry(kind.name, path),
      ),
      if (pendingPhotoKind != null) 'pendingPhotoKind': pendingPhotoKind!.name,
    };
  }

  factory RegistrationDraft.fromJson(Map<String, dynamic> json) {
    final role = switch (json['role']) {
      'passenger' => AppRole.passenger,
      'driver' => AppRole.driver,
      _ => null,
    };
    final registrationToken = json['registrationToken'];
    final savedAtEpochMs = json['savedAtEpochMs'];
    if (role == null ||
        registrationToken is! String ||
        registrationToken.trim().isEmpty ||
        savedAtEpochMs is! int) {
      throw const FormatException('Invalid registration draft');
    }

    final carPhotoPaths = <RegistrationUploadKind, String>{};
    final rawCarPhotos = json['carPhotoPaths'];
    if (rawCarPhotos is Map) {
      for (final entry in rawCarPhotos.entries) {
        final kind = _kindFromName(entry.key.toString());
        final path = entry.value;
        if (kind != null &&
            kind.name.startsWith('car') &&
            path is String &&
            path.trim().isNotEmpty) {
          carPhotoPaths[kind] = path;
        }
      }
    }

    return RegistrationDraft(
      role: role,
      registrationToken: registrationToken,
      name: json['name'] is String ? json['name'] as String : '',
      savedAtEpochMs: savedAtEpochMs,
      avatarPath: _nonEmptyString(json['avatarPath']),
      licensePath: _nonEmptyString(json['licensePath']),
      licenseBackPath: _nonEmptyString(json['licenseBackPath']),
      vehicleMakeModel: _stringOrEmpty(json['vehicleMakeModel']),
      vehicleColor: _stringOrEmpty(json['vehicleColor']),
      vehiclePlate: _stringOrEmpty(json['vehiclePlate']),
      carPhotoPaths: carPhotoPaths,
      pendingPhotoKind: _kindFromName(json['pendingPhotoKind'] as String?),
    );
  }
}

class RegistrationDraftStore {
  RegistrationDraftStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _storageKey = 'taxi_bgr_registration_draft';

  final FlutterSecureStorage _storage;

  Future<void> save(RegistrationDraft draft) {
    return _storage.write(key: _storageKey, value: jsonEncode(draft.toJson()));
  }

  Future<RegistrationDraft?> read() async {
    try {
      final raw = await _storage.read(key: _storageKey);
      if (raw == null) {
        return null;
      }
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Invalid registration draft');
      }
      final draft = RegistrationDraft.fromJson(decoded);
      if (draft.isExpired) {
        await clear();
        return null;
      }
      return draft;
    } on Object {
      await _clearQuietly();
      return null;
    }
  }

  Future<void> clear() {
    return _storage.delete(key: _storageKey);
  }

  Future<void> _clearQuietly() async {
    try {
      await clear();
    } on Object {
      // A corrupted draft must never block the registration screen.
    }
  }
}

RegistrationUploadKind? _kindFromName(String? value) {
  if (value == null) {
    return null;
  }
  for (final kind in RegistrationUploadKind.values) {
    if (kind.name == value) {
      return kind;
    }
  }
  return null;
}

String? _nonEmptyString(Object? value) {
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  return null;
}

String _stringOrEmpty(Object? value) => value is String ? value : '';
