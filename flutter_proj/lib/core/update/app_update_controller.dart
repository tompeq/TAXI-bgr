import 'dart:async';

import 'package:flutter/foundation.dart';

import 'app_update_service.dart';

enum AppUpdateStage { idle, available, downloading, ready, error }

class AppUpdateController extends ChangeNotifier {
  AppUpdateController({required this.service});

  final AppUpdateService service;

  AppUpdateStage _stage = AppUpdateStage.idle;
  AppUpdateInfo? _update;
  String? _downloadedPath;
  String? _error;
  double? _progress;
  bool _visible = false;
  bool _checked = false;
  bool _waitingForInstallPermission = false;
  bool _installActionInFlight = false;
  DateTime? _lastProgressNotification;

  AppUpdateStage get stage => _stage;
  AppUpdateInfo? get update => _update;
  String? get error => _error;
  double? get progress => _progress;
  bool get visible => _visible && _update != null;
  bool get waitingForInstallPermission => _waitingForInstallPermission;
  bool get hasDownloadedPackage => _downloadedPath != null;

  Future<void> check() async {
    if (_checked || !service.supported) {
      return;
    }
    _checked = true;
    try {
      final available = await service.checkForUpdate();
      if (available == null) {
        return;
      }
      _update = available;
      _stage = AppUpdateStage.available;
      _visible = true;
      notifyListeners();
      if (available.required) {
        unawaited(download());
      }
    } on Object {
      // Update checks are optional and must not affect app startup.
    }
  }

  Future<void> download() async {
    final available = _update;
    if (available == null || _stage == AppUpdateStage.downloading) {
      return;
    }
    _stage = AppUpdateStage.downloading;
    _error = null;
    _progress = 0;
    _visible = true;
    notifyListeners();
    try {
      final path = await service.download(available, onProgress: _setProgress);
      _downloadedPath = path;
      _progress = 1;
      _stage = AppUpdateStage.ready;
      _visible = true;
      notifyListeners();
    } on AppUpdateException catch (exception) {
      _error = exception.message;
      _stage = AppUpdateStage.error;
      _visible = true;
      notifyListeners();
    } on Object {
      _error = 'Не удалось скачать обновление';
      _stage = AppUpdateStage.error;
      _visible = true;
      notifyListeners();
    }
  }

  Future<void> install() async {
    final path = _downloadedPath;
    if (path == null || _installActionInFlight) {
      return;
    }
    _installActionInFlight = true;
    _error = null;
    try {
      final allowed = await service.canRequestPackageInstalls();
      if (!allowed) {
        _waitingForInstallPermission = true;
        notifyListeners();
        await service.openInstallPermissionSettings();
        return;
      }
      _waitingForInstallPermission = false;
      notifyListeners();
      await service.launchInstaller(path);
    } on Object {
      _error = 'Не удалось открыть установщик';
      _stage = AppUpdateStage.error;
      _visible = true;
      notifyListeners();
    } finally {
      _installActionInFlight = false;
    }
  }

  Future<void> onAppResumed() async {
    if (!_waitingForInstallPermission) {
      return;
    }
    _waitingForInstallPermission = false;
    await install();
  }

  void dismiss() {
    if (_update?.required == true) {
      return;
    }
    _visible = false;
    notifyListeners();
  }

  void show() {
    if (_update != null) {
      _visible = true;
      notifyListeners();
    }
  }

  void _setProgress(double? value) {
    _progress = value;
    final now = DateTime.now();
    final previous = _lastProgressNotification;
    if (value == 1 ||
        previous == null ||
        now.difference(previous) >= const Duration(milliseconds: 250)) {
      _lastProgressNotification = now;
      notifyListeners();
    }
  }
}
