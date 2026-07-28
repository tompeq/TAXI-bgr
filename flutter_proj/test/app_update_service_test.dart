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

  test(
    'waits for a paused system download and returns the completed APK',
    () async {
      var stateRequestCount = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            switch (call.method) {
              case 'startUpdateDownload':
                return {
                  'status': 'pending',
                  'downloadedBytes': 0,
                  'totalBytes': 100,
                };
              case 'getUpdateDownload':
                stateRequestCount++;
                if (stateRequestCount == 1) {
                  return {
                    'status': 'paused',
                    'downloadedBytes': 40,
                    'totalBytes': 100,
                  };
                }
                return {
                  'status': 'successful',
                  'downloadedBytes': 100,
                  'totalBytes': 100,
                  'path': '/updates/taxi-bgr-2.apk',
                };
              case 'sha256':
                return 'c' * 64;
            }
            return null;
          });
      final service = AppUpdateService(manifestUrl: 'http://updates.test/info');
      final progress = <double?>[];
      final update = AppUpdateInfo(
        versionName: '1.0.1',
        versionCode: 2,
        apkUri: Uri.parse('http://updates.test/taxi-bgr.apk'),
        sha256: 'c' * 64,
        sizeBytes: 100,
        releaseNotes: '',
        required: false,
      );

      final path = await service.download(update, onProgress: progress.add);

      expect(path, '/updates/taxi-bgr-2.apk');
      expect(progress, contains(0.4));
      expect(progress.last, 1);
      service.close();
    },
  );
}
