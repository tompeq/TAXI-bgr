import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_proj/core/update/app_update_banner.dart';
import 'package:flutter_proj/core/update/app_update_controller.dart';
import 'package:flutter_proj/core/update/app_update_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('ready update exposes a visible install button', (tester) async {
    final service = _InstallUpdateService();
    final controller = AppUpdateController(service: service);

    await controller.check();
    await service.downloadStarted.future;
    service.downloadCompleter.complete('/updates/taxi-bgr.apk');
    await tester.pump();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: AppUpdateBanner(controller: controller)),
      ),
    );

    final installButton = find.byKey(const ValueKey('install-update-button'));
    expect(installButton, findsOneWidget);
    expect(find.text('Установить обновление'), findsOneWidget);

    await tester.tap(installButton);
    await tester.pump();

    expect(service.launchedInstallerPath, '/updates/taxi-bgr.apk');

    controller.dispose();
    service.close();
  });
}

class _InstallUpdateService extends AppUpdateService {
  _InstallUpdateService() : super(manifestUrl: 'http://updates.test/manifest');

  final downloadStarted = Completer<void>();
  final downloadCompleter = Completer<String>();
  String? launchedInstallerPath;

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
    if (!downloadStarted.isCompleted) {
      downloadStarted.complete();
    }
    return downloadCompleter.future;
  }

  @override
  Future<bool> canRequestPackageInstalls() async => true;

  @override
  Future<void> launchInstaller(String filePath) async {
    launchedInstallerPath = filePath;
  }
}
