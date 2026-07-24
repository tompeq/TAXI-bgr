import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_proj/core/auth/auth_api_client.dart';
import 'package:flutter_proj/core/auth/auth_controller.dart';
import 'package:flutter_proj/core/auth/auth_session_store.dart';
import 'package:flutter_proj/core/data/local_catalog.dart';
import 'package:flutter_proj/core/driver_work/driver_work_api_client.dart';
import 'package:flutter_proj/core/finance/driver_finance_api_client.dart';
import 'package:flutter_proj/core/orders/order_api_client.dart';
import 'package:flutter_proj/core/orders/order_store.dart';
import 'package:flutter_proj/core/support/support_api_client.dart';
import 'package:flutter_proj/core/support/support_store.dart';
import 'package:flutter_proj/features/auth/role_selection_screen.dart';
import 'package:flutter_proj/features/passenger/passenger_home_screen.dart';

void main() {
  test('local address index suggests streets and places before map search', () {
    expect(
      localAddressSuggestions('Восточная 10').map((item) => item.title),
      contains('Восточная, 10'),
    );
    expect(
      localAddressSuggestions('поликлиника').map((item) => item.title),
      contains('Поликлиника'),
    );
  });

  testWidgets('shows role selection on launch', (tester) async {
    final api = AuthApiClient(baseUrl: 'http://localhost');
    final authController = AuthController(api: api, store: AuthSessionStore());
    addTearDown(() {
      authController.dispose();
      api.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: RoleSelectionScreen(authApi: api, authController: authController),
      ),
    );

    expect(find.text('Такси Бгр'), findsOneWidget);
    expect(find.text('Я пассажир'), findsOneWidget);
    expect(find.text('Я водитель'), findsOneWidget);
  });

  testWidgets('passenger map layout stays fixed when keyboard opens', (
    tester,
  ) async {
    final authApi = AuthApiClient(baseUrl: 'http://localhost');
    final authController = AuthController(
      api: authApi,
      store: AuthSessionStore(),
    );
    final orderApi = OrderApiClient(baseUrl: 'http://localhost');
    final driverWorkApi = DriverWorkApiClient(baseUrl: 'http://localhost');
    final driverFinanceApi = DriverFinanceApiClient(
      baseUrl: 'http://localhost',
    );
    final orderStore = OrderStore(
      api: orderApi,
      driverWorkApi: driverWorkApi,
      driverFinanceApi: driverFinanceApi,
      auth: authController,
    );
    final supportApi = SupportApiClient(baseUrl: 'http://localhost');
    final supportStore = SupportStore(api: supportApi, auth: authController);
    addTearDown(() {
      orderStore.dispose();
      orderApi.close();
      driverWorkApi.close();
      driverFinanceApi.close();
      supportApi.close();
      authController.dispose();
      authApi.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: PassengerHomeScreen(
          orderStore: orderStore,
          supportStore: supportStore,
        ),
      ),
    );

    final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
    expect(scaffold.resizeToAvoidBottomInset, isFalse);
  });

  testWidgets('typed address stays unselected until a suggestion is chosen', (
    tester,
  ) async {
    final authApi = AuthApiClient(baseUrl: 'http://localhost');
    final authController = AuthController(
      api: authApi,
      store: AuthSessionStore(),
    );
    final orderApi = OrderApiClient(baseUrl: 'http://localhost');
    final driverWorkApi = DriverWorkApiClient(baseUrl: 'http://localhost');
    final driverFinanceApi = DriverFinanceApiClient(
      baseUrl: 'http://localhost',
    );
    final orderStore = OrderStore(
      api: orderApi,
      driverWorkApi: driverWorkApi,
      driverFinanceApi: driverFinanceApi,
      auth: authController,
    );
    final supportApi = SupportApiClient(baseUrl: 'http://localhost');
    final supportStore = SupportStore(api: supportApi, auth: authController);
    addTearDown(() {
      orderStore.dispose();
      orderApi.close();
      driverWorkApi.close();
      driverFinanceApi.close();
      supportApi.close();
      authController.dispose();
      authApi.close();
    });

    await tester.pumpWidget(
      MaterialApp(
        home: PassengerHomeScreen(
          orderStore: orderStore,
          supportStore: supportStore,
        ),
      ),
    );

    await tester.tap(find.byType(TextField).first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(
      tester
          .widget<DraggableScrollableSheet>(
            find.byType(DraggableScrollableSheet),
          )
          .maxChildSize,
      0.94,
    );
    expect(find.text('Кирова, 12'), findsWidgets);

    await tester.enterText(find.byType(TextField).first, 'Восточная 10');
    await tester.pump();

    expect(find.text('Выберите адрес из подсказок'), findsWidgets);
    expect(find.textContaining('Заказать'), findsNothing);
  });
}
