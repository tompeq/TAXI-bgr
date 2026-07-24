import 'package:flutter_proj/core/auth/auth_api_client.dart';
import 'package:flutter_proj/core/auth/auth_controller.dart';
import 'package:flutter_proj/core/auth/auth_models.dart';
import 'package:flutter_proj/core/auth/auth_session_store.dart';
import 'package:flutter_proj/core/models/app_role.dart';
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
