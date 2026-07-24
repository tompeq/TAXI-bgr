import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

import '../../firebase_options.dart';
import '../auth/auth_controller.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } on Object {
    // Firebase is optional until platform configuration files are installed.
  }
}

void registerBackgroundPushHandler() {
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
}

class PushNotificationClient {
  PushNotificationClient({
    required String apiBaseUrl,
    required this.auth,
    http.Client? client,
  }) : _apiBaseUrl = apiBaseUrl.replaceFirst(RegExp(r'/$'), ''),
       _client = client ?? http.Client();

  static const _channel = AndroidNotificationChannel(
    'taxi_orders',
    'Заказы и поездки',
    description: 'Новые заказы и изменения активной поездки',
    importance: Importance.high,
  );

  final String _apiBaseUrl;
  final AuthController auth;
  final http.Client _client;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final StreamController<String> _eventController =
      StreamController<String>.broadcast();

  StreamSubscription<String>? _tokenSubscription;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  String? _registeredToken;
  String? _registeredUserId;
  bool _firebasePrepared = false;
  bool _started = false;

  Stream<String> get events => _eventController.stream;

  Future<void> requestPermission() async {
    if (!_supportedPlatform) {
      return;
    }
    try {
      await _prepareFirebase();
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    } on Object {
      // The app remains usable until Firebase is configured on the platform.
    }
  }

  Future<void> start() async {
    if (!_supportedPlatform) {
      return;
    }
    final accessToken = auth.session?.accessToken;
    if (accessToken == null || accessToken.startsWith('local-dev-')) {
      return;
    }
    if (_started) {
      try {
        await _registerCurrentAccountToken();
      } on Object {
        // A profile switch must not block use of the application.
      }
      return;
    }
    _started = true;
    try {
      await _prepareFirebase();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      await _registerCurrentAccountToken();
      _tokenSubscription = messaging.onTokenRefresh.listen(
        (token) => unawaited(_registerToken(token)),
      );
      _messageSubscription = FirebaseMessaging.onMessage.listen((message) {
        final type = message.data['type'];
        if (type is String && type.isNotEmpty) {
          _eventController.add(type);
        }
        unawaited(_showForegroundMessage(message));
      });
    } on Object {
      _started = false;
      // The app remains usable before Firebase files are configured.
    }
  }

  Future<void> unregister() async {
    final token = _registeredToken;
    if (token == null || auth.session == null) {
      return;
    }
    try {
      await auth.authorizedRequest((accessToken) async {
        final request = http.Request(
          'DELETE',
          Uri.parse('$_apiBaseUrl/notifications/devices'),
        );
        request.headers['Authorization'] = 'Bearer $accessToken';
        request.headers['Content-Type'] = 'application/json';
        request.body = jsonEncode({'token': token});
        final response = await _client.send(request);
        await response.stream.drain<void>();
      });
    } on Object {
      // Logging out must not be blocked by an unavailable push endpoint.
    }
    _registeredToken = null;
    _registeredUserId = null;
    _started = false;
    await _tokenSubscription?.cancel();
    await _messageSubscription?.cancel();
    _tokenSubscription = null;
    _messageSubscription = null;
  }

  Future<void> _registerToken(String token) async {
    final userId = auth.session?.user.id;
    if (userId == null ||
        (_registeredToken == token && _registeredUserId == userId)) {
      return;
    }
    await auth.authorizedRequest((accessToken) async {
      final response = await _client.post(
        Uri.parse('$_apiBaseUrl/notifications/devices'),
        headers: {
          'Authorization': 'Bearer $accessToken',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'token': token,
          'platform': Platform.isIOS ? 'ios' : 'android',
          'deviceName': Platform.operatingSystemVersion,
        }),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('Push token registration failed');
      }
    });
    _registeredToken = token;
    _registeredUserId = userId;
  }

  Future<void> _registerCurrentAccountToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null) {
      await _registerToken(token);
    }
  }

  Future<void> _prepareFirebase() async {
    if (_firebasePrepared) {
      return;
    }
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await _initializeLocalNotifications();
    _firebasePrepared = true;
  }

  Future<void> _initializeLocalNotifications() async {
    await _localNotifications.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_channel);
  }

  Future<void> _showForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) {
      return;
    }
    await _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'taxi_orders',
          'Заказы и поездки',
          channelDescription: 'Новые заказы и изменения активной поездки',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  bool get _supportedPlatform {
    return !kIsWeb && (Platform.isAndroid || Platform.isIOS);
  }

  void dispose() {
    _tokenSubscription?.cancel();
    _messageSubscription?.cancel();
    _eventController.close();
    _client.close();
  }
}
