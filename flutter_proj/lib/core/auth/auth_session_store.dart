import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/app_role.dart';
import 'auth_models.dart';

class StoredAuthSessions {
  const StoredAuthSessions({required this.sessions, required this.activeRole});

  final Map<AppRole, AuthSession> sessions;
  final AppRole? activeRole;

  AuthSession? get activeSession =>
      activeRole == null ? null : sessions[activeRole!];

  Map<String, dynamic> toJson() {
    return {
      'activeRole': activeRole?.name,
      'sessions': {
        for (final entry in sessions.entries)
          entry.key.name: entry.value.toJson(),
      },
    };
  }

  factory StoredAuthSessions.fromJson(Map<String, dynamic> json) {
    final rawSessions = json['sessions'];
    if (rawSessions is! Map) {
      throw const FormatException('Stored sessions are missing');
    }

    final sessions = <AppRole, AuthSession>{};
    for (final entry in rawSessions.entries) {
      final role = _roleFromName(entry.key);
      if (role == null || entry.value is! Map) {
        throw const FormatException('Stored session is invalid');
      }
      final session = AuthSession.fromJson(
        Map<String, dynamic>.from(entry.value as Map),
      );
      if (session.user.role != role) {
        throw const FormatException('Stored session role does not match');
      }
      sessions[role] = session;
    }

    final activeRole = switch (json['activeRole']) {
      null => null,
      'passenger' => AppRole.passenger,
      'driver' => AppRole.driver,
      _ => throw const FormatException('Stored active role is invalid'),
    };
    if (activeRole != null && !sessions.containsKey(activeRole)) {
      throw const FormatException('Stored active role has no session');
    }
    return StoredAuthSessions(sessions: sessions, activeRole: activeRole);
  }

  static AppRole? _roleFromName(Object? value) {
    return switch (value) {
      'passenger' => AppRole.passenger,
      'driver' => AppRole.driver,
      _ => null,
    };
  }
}

class AuthSessionStore {
  AuthSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _sessionsKey = 'taxi_bgr_auth_sessions';
  static const _legacySessionKey = 'taxi_bgr_auth_session';

  final FlutterSecureStorage _storage;

  Future<StoredAuthSessions> readAll() async {
    final raw = await _storage.read(key: _sessionsKey);
    if (raw != null) {
      try {
        return StoredAuthSessions.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
      } on Object {
        await clear();
        return const StoredAuthSessions(sessions: {}, activeRole: null);
      }
    }

    final legacyRaw = await _storage.read(key: _legacySessionKey);
    if (legacyRaw == null) {
      return const StoredAuthSessions(sessions: {}, activeRole: null);
    }
    try {
      final session = AuthSession.fromJson(
        jsonDecode(legacyRaw) as Map<String, dynamic>,
      );
      final role = session.user.role;
      if (role == null) {
        throw const FormatException('Legacy session role is invalid');
      }
      final restored = StoredAuthSessions(
        sessions: {role: session},
        activeRole: role,
      );
      await writeAll(restored);
      return restored;
    } on Object {
      await clear();
      return const StoredAuthSessions(sessions: {}, activeRole: null);
    }
  }

  Future<void> writeAll(StoredAuthSessions sessions) async {
    await _storage.write(
      key: _sessionsKey,
      value: jsonEncode(sessions.toJson()),
    );
    await _storage.delete(key: _legacySessionKey);
  }

  Future<void> clear() async {
    await Future.wait([
      _storage.delete(key: _sessionsKey),
      _storage.delete(key: _legacySessionKey),
    ]);
  }
}
