import 'package:flutter_proj/core/auth/auth_api_client.dart';
import 'package:flutter_proj/core/auth/auth_controller.dart';
import 'package:flutter_proj/core/auth/auth_models.dart';
import 'package:flutter_proj/core/auth/auth_session_store.dart';
import 'package:flutter_proj/core/driver_work/driver_work_api_client.dart';
import 'package:flutter_proj/core/finance/driver_finance_api_client.dart';
import 'package:flutter_proj/core/models/app_role.dart';
import 'package:flutter_proj/core/models/taxi_order.dart';
import 'package:flutter_proj/core/orders/order_api_client.dart';
import 'package:flutter_proj/core/orders/order_store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'keeps the current trip active while reserving one next order',
    () async {
      final authApi = AuthApiClient(baseUrl: 'http://localhost');
      final auth = AuthController(api: authApi, store: _MemorySessionStore());
      final orderApi = OrderApiClient(baseUrl: 'http://localhost');
      final workApi = DriverWorkApiClient(baseUrl: 'http://localhost');
      final financeApi = DriverFinanceApiClient(baseUrl: 'http://localhost');
      final store = OrderStore(
        api: orderApi,
        driverWorkApi: workApi,
        driverFinanceApi: financeApi,
        auth: auth,
      );
      addTearDown(() {
        store.dispose();
        orderApi.close();
        workApi.close();
        financeApi.close();
        auth.dispose();
        authApi.close();
      });

      await auth.acceptSession(_localDriverSession());
      await store.loadDriverState();
      await store.startDriverShift();

      final currentId = store.openOrders.first.id;
      await store.acceptOrder(currentId);
      await store.updateActiveStatus(OrderStatus.driverEnRoute);
      final nextId = store.openOrders.first.id;
      await store.acceptOrder(nextId);

      expect(store.activeDriverOrder?.id, currentId);
      expect(store.scheduledDriverOrders.map((order) => order.id), [nextId]);

      await store.updateActiveStatus(OrderStatus.completed);

      expect(store.activeDriverOrder?.id, nextId);
      expect(store.activeDriverOrder?.status, OrderStatus.accepted);
      expect(store.scheduledDriverOrders, isEmpty);
    },
  );
}

AuthSession _localDriverSession() {
  return const AuthSession(
    accessToken: 'local-dev-driver',
    refreshToken: 'local-dev-refresh',
    accessTokenExpiresInSeconds: 3600,
    user: AuthUser(
      id: 'driver-id',
      phone: '+79140000000',
      name: 'Иванов Иван Иванович',
      role: AppRole.driver,
      status: 'active',
      driverVerificationStatus: 'approved',
    ),
  );
}

class _MemorySessionStore extends AuthSessionStore {
  StoredAuthSessions value = const StoredAuthSessions(
    sessions: {},
    activeRole: null,
  );

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
