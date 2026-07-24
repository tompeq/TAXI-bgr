import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../core/auth/auth_api_client.dart';
import '../core/auth/auth_controller.dart';
import '../core/auth/registration_draft_store.dart';
import '../core/auth/auth_session_store.dart';
import '../core/config/app_config.dart';
import '../core/driver_work/driver_work_api_client.dart';
import '../core/finance/driver_finance_api_client.dart';
import '../core/models/app_role.dart';
import '../core/orders/order_api_client.dart';
import '../core/orders/order_store.dart';
import '../core/support/support_api_client.dart';
import '../core/support/support_store.dart';
import '../core/theme/app_theme.dart';
import '../core/tracking/tracking_client.dart';
import '../core/notifications/push_notification_client.dart';
import '../core/update/app_update_banner.dart';
import '../core/update/app_update_controller.dart';
import '../core/update/app_update_service.dart';
import '../features/auth/registration_screen.dart';
import '../features/auth/role_selection_screen.dart';
import '../features/driver/driver_navigation_screen.dart';
import '../features/driver/driver_verification_screen.dart';
import '../features/passenger/passenger_home_screen.dart';

class TaxiBgrApp extends StatefulWidget {
  const TaxiBgrApp({super.key});

  @override
  State<TaxiBgrApp> createState() => _TaxiBgrAppState();
}

class _TaxiBgrAppState extends State<TaxiBgrApp> with WidgetsBindingObserver {
  final _navigatorKey = GlobalKey<NavigatorState>();
  late final OrderApiClient _ordersApi;
  late final DriverWorkApiClient _driverWorkApi;
  late final DriverFinanceApiClient _driverFinanceApi;
  late final OrderStore _orderStore;
  late final SupportApiClient _supportApi;
  late final SupportStore _supportStore;
  late final AuthApiClient _authApi;
  late final AuthController _authController;
  late final TrackingClient _trackingClient;
  late final PushNotificationClient _pushNotifications;
  late final AppUpdateService _appUpdateService;
  late final AppUpdateController _appUpdateController;
  late final RegistrationDraftStore _registrationDraftStore;
  RegistrationDraft? _registrationDraft;
  bool _registrationRecoveryLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _authApi = AuthApiClient(baseUrl: AppConfig.apiBaseUrl);
    _authController = AuthController(api: _authApi, store: AuthSessionStore());
    _registrationDraftStore = RegistrationDraftStore();
    _ordersApi = OrderApiClient(baseUrl: AppConfig.apiBaseUrl);
    _driverWorkApi = DriverWorkApiClient(baseUrl: AppConfig.apiBaseUrl);
    _driverFinanceApi = DriverFinanceApiClient(baseUrl: AppConfig.apiBaseUrl);
    _orderStore = OrderStore(
      api: _ordersApi,
      driverWorkApi: _driverWorkApi,
      driverFinanceApi: _driverFinanceApi,
      auth: _authController,
    );
    _supportApi = SupportApiClient(baseUrl: AppConfig.apiBaseUrl);
    _supportStore = SupportStore(api: _supportApi, auth: _authController);
    _trackingClient = TrackingClient(
      apiBaseUrl: AppConfig.apiBaseUrl,
      auth: _authController,
    );
    _pushNotifications = PushNotificationClient(
      apiBaseUrl: AppConfig.apiBaseUrl,
      auth: _authController,
    );
    _appUpdateService = AppUpdateService(
      manifestUrl: AppConfig.updateManifestUrl,
    );
    _appUpdateController = AppUpdateController(service: _appUpdateService);
    unawaited(_initialize());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _authController.dispose();
    _authApi.close();
    _ordersApi.close();
    _driverWorkApi.close();
    _driverFinanceApi.close();
    _supportApi.close();
    _orderStore.dispose();
    _trackingClient.dispose();
    _pushNotifications.dispose();
    _appUpdateController.dispose();
    _appUpdateService.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'Такси Бгр',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      locale: const Locale('ru', 'RU'),
      supportedLocales: const [Locale('ru', 'RU')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) {
        return Stack(
          fit: StackFit.expand,
          children: [
            ?child,
            Positioned(
              top: MediaQuery.paddingOf(context).top + 8,
              left: 12,
              right: 12,
              child: AnimatedBuilder(
                animation: _appUpdateController,
                builder: (context, _) {
                  return AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    child: _appUpdateController.visible
                        ? AppUpdateBanner(
                            key: const ValueKey('app-update-banner'),
                            controller: _appUpdateController,
                          )
                        : const SizedBox.shrink(
                            key: ValueKey('app-update-hidden'),
                          ),
                  );
                },
              ),
            ),
          ],
        );
      },
      home: AnimatedBuilder(
        animation: _authController,
        builder: (context, _) => _buildHome(),
      ),
    );
  }

  Widget _buildHome() {
    if (!_authController.initialized || !_registrationRecoveryLoaded) {
      return const _AuthLoadingScreen();
    }

    final session = _authController.session;
    if (session == null) {
      final draft = _registrationDraft;
      if (draft != null) {
        return RegistrationScreen(
          role: draft.role,
          authApi: _authApi,
          authController: _authController,
          initialDraft: draft,
          draftStore: _registrationDraftStore,
          onDraftCleared: _clearRegistrationDraft,
        );
      }
      return RoleSelectionScreen(
        authApi: _authApi,
        authController: _authController,
      );
    }

    if (!AppConfig.isInterfaceDemo) {
      unawaited(_pushNotifications.start());
    }

    return switch (session.user.role) {
      AppRole.passenger => PassengerHomeScreen(
        orderStore: _orderStore,
        supportStore: _supportStore,
        trackingClient: _trackingClient,
        onSwitchToDriver: () => _openOrSwitchRole(AppRole.driver),
        onLogout: _logout,
      ),
      AppRole.driver when session.user.isApprovedDriver => DriverHomeScreen(
        orderStore: _orderStore,
        supportStore: _supportStore,
        trackingClient: _trackingClient,
        orderEvents: _pushNotifications.events,
        onSwitchToPassenger: () => _openOrSwitchRole(AppRole.passenger),
        onLogout: _logout,
      ),
      AppRole.driver => DriverVerificationScreen(
        authController: _authController,
        onSwitchToPassenger: () => _openOrSwitchRole(AppRole.passenger),
        onLogout: _logout,
      ),
      null => _UnsupportedAccountScreen(authController: _authController),
    };
  }

  Future<void> _initialize() async {
    final draftFuture = _registrationDraftStore.read();
    await _authController.initialize();
    final draft = await draftFuture;
    if (_authController.session == null) {
      _registrationDraft = draft;
    } else if (draft != null) {
      await _registrationDraftStore.clear();
    }
    if (mounted) {
      setState(() => _registrationRecoveryLoaded = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!AppConfig.isInterfaceDemo && AppConfig.hasUpdateManifest) {
          unawaited(_appUpdateController.check());
        }
      });
    }
    if (!AppConfig.isInterfaceDemo) {
      await _pushNotifications.requestPermission();
      await _pushNotifications.start();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_appUpdateController.onAppResumed());
    }
  }

  void _clearRegistrationDraft() {
    if (mounted) {
      setState(() => _registrationDraft = null);
    }
  }

  Future<void> _logout() async {
    if (!AppConfig.isInterfaceDemo) {
      await _pushNotifications.unregister();
    }
    await _authController.logout();
  }

  Future<void> _openOrSwitchRole(AppRole role) async {
    if (_authController.hasSessionFor(role)) {
      _resetAccountScopedState();
      await _authController.switchToRole(role);
      if (!AppConfig.isInterfaceDemo) {
        unawaited(_pushNotifications.start());
      }
      return;
    }

    final navigator = _navigatorKey.currentState;
    if (navigator == null) {
      return;
    }
    await navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => RegistrationScreen(
          role: role,
          authApi: _authApi,
          authController: _authController,
          draftStore: _registrationDraftStore,
          onDraftCleared: _clearRegistrationDraft,
        ),
      ),
    );
    if (_authController.session?.user.role == role) {
      _resetAccountScopedState();
      if (!AppConfig.isInterfaceDemo) {
        unawaited(_pushNotifications.start());
      }
    }
  }

  void _resetAccountScopedState() {
    _trackingClient.clearOrder();
    _orderStore.resetForAccountSwitch();
    _supportStore.resetForAccountSwitch();
  }
}

class _AuthLoadingScreen extends StatelessWidget {
  const _AuthLoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: SizedBox.square(
          dimension: 28,
          child: CircularProgressIndicator(strokeWidth: 3),
        ),
      ),
    );
  }
}

class _UnsupportedAccountScreen extends StatelessWidget {
  const _UnsupportedAccountScreen({required this.authController});

  final AuthController authController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.admin_panel_settings_outlined, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Этот аккаунт предназначен для web-админки',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: authController.logout,
                  icon: const Icon(Icons.logout),
                  label: const Text('Выйти'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
