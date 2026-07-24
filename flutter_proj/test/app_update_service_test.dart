import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_proj/core/update/app_update_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('ru.taxibgr.app/app_update');

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'getAppInfo') {
            return {'versionName': '1.0.0', 'versionCode': 1};
          }
          return null;
        });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('offers an APK with a greater version code', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'versionName': '1.0.1',
          'versionCode': 2,
          'apkUrl': 'taxi-bgr.apk',
          'sha256': 'a' * 64,
          'sizeBytes': 123,
          'releaseNotes': 'Исправления',
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final service = AppUpdateService(
      manifestUrl: 'http://server.test/taxi-bgr-update.json',
      client: client,
    );

    final update = await service.checkForUpdate();

    expect(update?.versionCode, 2);
    expect(update?.apkUri, Uri.parse('http://server.test/taxi-bgr.apk'));
    service.close();
  });

  test('ignores the currently installed version', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'versionName': '1.0.0',
          'versionCode': 1,
          'apkUrl': 'taxi-bgr.apk',
          'sha256': 'b' * 64,
        }),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final service = AppUpdateService(
      manifestUrl: 'http://server.test/taxi-bgr-update.json',
      client: client,
    );

    expect(await service.checkForUpdate(), isNull);
    service.close();
  });
}
