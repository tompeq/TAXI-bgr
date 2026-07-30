import 'dart:async';

import 'package:flutter_proj/core/auth/auth_api_client.dart';
import 'package:flutter_proj/core/auth/auth_controller.dart';
import 'package:flutter_proj/core/auth/auth_models.dart';
import 'package:flutter_proj/core/auth/auth_session_store.dart';
import 'package:flutter_proj/core/models/app_role.dart';
import 'package:flutter_proj/core/network/api_exception.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'keeps both roles signed in and switches between their sessions',
    () async {
      final passenger = _session(AppRole.passenger);
      final driver = _session(AppRole.driver);
      final store = _MemoryAuthSessionStore(
        StoredAuthSessions(
          sessions: {AppRole.passenger: passenger},
          activeRole: AppRole.passenger,
        ),
      );
      final api = _NoopAuthApiClient();
      final controller = AuthController(api: api, store: store);
      addTearDown(() {
        controller.dispose();
        api.close();
      });

      await controller.initialize();
      await controller.acceptSession(driver);

      expect(controller.session?.user.role, AppRole.driver);
      expect(controller.hasSessionFor(AppRole.passenger), isTrue);
      expect(controller.hasSessionFor(AppRole.driver), isTrue);

      final switched = await controller.switchToRole(AppRole.passenger);

      expect(switched, isTrue);
      expect(controller.session?.user.role, AppRole.passenger);
      expect(store.value.sessions.keys, containsAll(AppRole.values));
    },
  );

  test('serializes passenger and driver sessions separately', () {
    final sessions = StoredAuthSessions(
      sessions: {
        AppRole.passenger: _session(AppRole.passenger),
        AppRole.driver: _session(AppRole.driver),
      },
      activeRole: AppRole.driver,
    );

    final restored = StoredAuthSessions.fromJson(sessions.toJson());

    expect(restored.activeRole, AppRole.driver);
    expect(restored.sessions[AppRole.passenger]?.user.id, 'passenger-id');
    expect(restored.sessions[AppRole.driver]?.user.id, 'driver-id');
  });

  test(
    'does not call the API while logging out of a local demo session',
    () async {
      final store = _MemoryAuthSessionStore(
        StoredAuthSessions(
          sessions: {AppRole.passenger: _session(AppRole.passenger)},
          activeRole: AppRole.passenger,
        ),
      );
      final api = _NoopAuthApiClient();
      final controller = AuthController(api: api, store: store);
      addTearDown(() {
        controller.dispose();
        api.close();
      });

      await controller.initialize();
      await controller.acceptSession(_localDemoSession());
      await controller.logout();

      expect(api.loggedOutTokens, isEmpty);
      expect(controller.session, isNull);
    },
  );

  test('shares one token refresh between concurrent requests', () async {
    final passenger = _session(AppRole.passenger);
    final store = _MemoryAuthSessionStore(
      StoredAuthSessions(
        sessions: {AppRole.passenger: passenger},
        activeRole: AppRole.passenger,
      ),
    );
    final api = _RefreshAuthApiClient();
    final controller = AuthController(api: api, store: store);
    addTearDown(() {
      controller.dispose();
      api.close();
    });
    await controller.initialize();

    Future<String> request(String token) async {
      if (token == passenger.accessToken) {
        throw const ApiException(
          message: 'Access token expired',
          statusCode: 401,
        );
      }
      return token;
    }

    final first = controller.authorizedRequest(request);
    final second = controller.authorizedRequest(request);
    await Future<void>.delayed(Duration.zero);

    expect(api.refreshCalls, 1);

    final refreshed = _refreshedSession(AppRole.passenger);
    api.refreshCompleter.complete(refreshed);

    expect(await Future.wait([first, second]), [
      refreshed.accessToken,
      refreshed.accessToken,
    ]);
    expect(controller.session?.refreshToken, refreshed.refreshToken);
    expect(store.value.activeSession?.refreshToken, refreshed.refreshToken);
  });

  test('keeps the session when refresh fails because of the network', () async {
    final passenger = _session(AppRole.passenger);
    final store = _MemoryAuthSessionStore(
      StoredAuthSessions(
        sessions: {AppRole.passenger: passenger},
        activeRole: AppRole.passenger,
      ),
    );
    final api = _RefreshAuthApiClient();
    final controller = AuthController(api: api, store: store);
    addTearDown(() {
      controller.dispose();
      api.close();
    });
    await controller.initialize();

    final request = controller.authorizedRequest<String>((_) async {
      throw const ApiException(
        message: 'Access token expired',
        statusCode: 401,
      );
    });
    await Future<void>.delayed(Duration.zero);
    api.refreshCompleter.completeError(
      const ApiException(message: 'Сервер недоступен'),
    );

    await expectLater(request, throwsA(isA<ApiException>()));
    expect(controller.session?.refreshToken, passenger.refreshToken);
    expect(store.value.activeSession?.refreshToken, passenger.refreshToken);
  });
}

AuthSession _session(AppRole role) {
  return AuthSession(
    accessToken: '${role.name}-access-token',
    refreshToken: '${role.name}-refresh-token',
    accessTokenExpiresInSeconds: 3600,
    user: AuthUser(
      id: '${role.name}-id',
      phone: '+79990000000',
      name: role == AppRole.driver ? 'Driver' : 'Passenger',
      role: role,
      status: 'active',
      driverVerificationStatus: role == AppRole.driver ? 'approved' : null,
    ),
  );
}

AuthSession _localDemoSession() {
  final session = _session(AppRole.passenger);
  return AuthSession(
    accessToken: 'local-dev-access-token',
    refreshToken: session.refreshToken,
    accessTokenExpiresInSeconds: session.accessTokenExpiresInSeconds,
    user: session.user,
  );
}

AuthSession _refreshedSession(AppRole role) {
  final session = _session(role);
  return AuthSession(
    accessToken: '${role.name}-new-access-token',
    refreshToken: '${role.name}-new-refresh-token',
    accessTokenExpiresInSeconds: session.accessTokenExpiresInSeconds,
    user: session.user,
  );
}

class _MemoryAuthSessionStore extends AuthSessionStore {
  _MemoryAuthSessionStore(this.value);

  StoredAuthSessions value;

  @override
  Future<StoredAuthSessions> readAll() async => value;

  @override
  Future<void> writeAll(StoredAuthSessions sessions) async {
    value = sessions;
  }

  @override
  Future<void> clear() async {
    value = const StoredAuthSessions(sessions: {}, activeRole: null);
  }
}

class _NoopAuthApiClient extends AuthApiClient {
  _NoopAuthApiClient() : super(baseUrl: 'http://localhost');

  final loggedOutTokens = <String>[];

  @override
  Future<void> logout(String accessToken) async {
    loggedOutTokens.add(accessToken);
  }
}

class _RefreshAuthApiClient extends AuthApiClient {
  _RefreshAuthApiClient() : super(baseUrl: 'http://localhost');

  final refreshCompleter = Completer<AuthSession>();
  int refreshCalls = 0;

  @override
  Future<AuthSession> refresh(String refreshToken) {
    refreshCalls++;
    return refreshCompleter.future;
  }
}
