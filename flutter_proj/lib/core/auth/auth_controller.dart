import 'package:flutter/foundation.dart';

import '../models/app_role.dart';
import '../network/api_exception.dart';
import 'auth_api_client.dart';
import 'auth_models.dart';
import 'auth_session_store.dart';

class AuthController extends ChangeNotifier {
  AuthController({required this.api, required this.store});

  final AuthApiClient api;
  final AuthSessionStore store;

  final Map<AppRole, AuthSession> _sessions = {};
  AppRole? _activeRole;
  bool _initialized = false;

  AuthSession? get session =>
      _activeRole == null ? null : _sessions[_activeRole!];
  bool get initialized => _initialized;
  bool hasSessionFor(AppRole role) => _sessions.containsKey(role);
  Set<AppRole> get signedInRoles => Set.unmodifiable(_sessions.keys);

  Future<void> initialize() async {
    try {
      final stored = await store.readAll();
      _sessions
        ..clear()
        ..addAll(stored.sessions);
      _activeRole = stored.activeRole;
      if (_activeRole == null && _sessions.isNotEmpty) {
        _activeRole = _sessions.keys.first;
      }
    } on Object {
      _sessions.clear();
      _activeRole = null;
    } finally {
      _initialized = true;
      notifyListeners();
    }
  }

  Future<void> acceptSession(AuthSession session) async {
    final role = session.user.role;
    if (role == null) {
      throw const ApiException(message: 'Неподдерживаемая роль аккаунта');
    }
    _sessions[role] = session;
    _activeRole = role;
    await _persistSessions();
    notifyListeners();
  }

  Future<bool> switchToRole(AppRole role) async {
    if (!_sessions.containsKey(role)) {
      return false;
    }
    if (_activeRole != role) {
      _activeRole = role;
      await _persistSessions();
      notifyListeners();
    }
    return true;
  }

  Future<AuthUser> refreshCurrentUser() async {
    final current = session;
    if (current == null) {
      throw const ApiException(message: 'Сессия не найдена');
    }

    try {
      final user = await api.getCurrentUser(current.accessToken);
      final updated = current.copyWith(user: user);
      await acceptSession(updated);
      return user;
    } on ApiException catch (error) {
      if (!error.isUnauthorized) {
        rethrow;
      }
      final refreshed = await api.refresh(current.refreshToken);
      await acceptSession(refreshed);
      return refreshed.user;
    }
  }

  Future<T> authorizedRequest<T>(
    Future<T> Function(String accessToken) request,
  ) async {
    final current = session;
    if (current == null) {
      throw const ApiException(message: 'Сессия не найдена');
    }
    try {
      return await request(current.accessToken);
    } on ApiException catch (error) {
      if (!error.isUnauthorized) {
        rethrow;
      }
    }

    try {
      final refreshed = await api.refresh(current.refreshToken);
      await acceptSession(refreshed);
      return request(refreshed.accessToken);
    } on Object {
      await _discardSessionFor(current.user.role);
      rethrow;
    }
  }

  Future<void> logout() async {
    final sessions = _sessions.values.toList(growable: false);
    _sessions.clear();
    _activeRole = null;
    await store.clear();
    notifyListeners();

    for (final current in sessions) {
      if (current.accessToken.startsWith('local-dev-')) {
        continue;
      }
      try {
        await api.logout(current.accessToken);
      } on Object {
        // The local session is removed even when the server is unavailable.
      }
    }
  }

  Future<void> _discardSessionFor(AppRole? role) async {
    if (role == null) {
      _sessions.clear();
      _activeRole = null;
      await store.clear();
    } else {
      _sessions.remove(role);
      if (_activeRole == role) {
        _activeRole = _sessions.isEmpty ? null : _sessions.keys.first;
      }
      await _persistSessions();
    }
    notifyListeners();
  }

  Future<void> _persistSessions() {
    if (_sessions.isEmpty) {
      return store.clear();
    }
    return store.writeAll(
      StoredAuthSessions(
        sessions: Map<AppRole, AuthSession>.from(_sessions),
        activeRole: _activeRole,
      ),
    );
  }
}
