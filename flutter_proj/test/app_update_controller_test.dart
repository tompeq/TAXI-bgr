import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_proj/core/update/app_update_controller.dart';
import 'package:flutter_proj/core/update/app_update_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('downloads automatically without blocking the app', () async {
    final service = _FakeUpdateService();
    final controller = AppUpdateController(service: service);

    await controller.check();
    await Future<void>.delayed(Duration.zero);
    expect(controller.stage, AppUpdateStage.downloading);
    expect(controller.progress, 0.25);
    expect(controller.visible, isFalse);

    service.downloadCompleter.complete('/updates/taxi-bgr.apk');
    await Future<void>.delayed(Duration.zero);
    expect(controller.stage, AppUpdateStage.ready);
    expect(controller.visible, isTrue);
    expect(controller.hasDownloadedPackage, isTrue);

    controller.dispose();
    service.close();
  });
}

class _FakeUpdateService extends AppUpdateService {
  _FakeUpdateService() : super(manifestUrl: 'http://updates.test/manifest');

  final downloadCompleter = Completer<String>();

  @override
  bool get supported => true;

  @override
  Future<AppUpdateInfo?> checkForUpdate() async {
    return AppUpdateInfo(
      versionName: '1.0.3',
      versionCode: 5,
      apkUri: Uri.parse('http://updates.test/app.apk'),
      sha256: 'a' * 64,
      sizeBytes: 100,
      releaseNotes: 'Исправления',
      required: false,
    );
  }

  @override
  Future<String> download(
    AppUpdateInfo update, {
    required ValueChanged<double?> onProgress,
  }) {
    onProgress(0.25);
    return downloadCompleter.future;
  }
}
