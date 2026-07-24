import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

class AppUpdateInfo {
  const AppUpdateInfo({
    required this.versionName,
    required this.versionCode,
    required this.apkUri,
    required this.sha256,
    required this.sizeBytes,
    required this.releaseNotes,
    required this.required,
  });

  final String versionName;
  final int versionCode;
  final Uri apkUri;
  final String sha256;
  final int sizeBytes;
  final String releaseNotes;
  final bool required;
}

class AppUpdateException implements Exception {
  const AppUpdateException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AppUpdateService {
  AppUpdateService({required String manifestUrl, http.Client? client})
    : _manifestUrl = manifestUrl.trim(),
      _client = client ?? http.Client();

  static const _platform = MethodChannel('ru.taxibgr.app/app_update');

  final String _manifestUrl;
  final http.Client _client;

  bool get supported =>
      !kIsWeb &&
      defaultTargetPlatform == TargetPlatform.android &&
      _manifestUrl.isNotEmpty;

  Future<AppUpdateInfo?> checkForUpdate() async {
    if (!supported) {
      return null;
    }

    final manifestUri = Uri.parse(_manifestUrl);
    final requestUri = manifestUri.replace(
      queryParameters: {
        ...manifestUri.queryParameters,
        '_': DateTime.now().millisecondsSinceEpoch.toString(),
      },
    );
    final response = await _client
        .get(requestUri, headers: const {'Cache-Control': 'no-cache'})
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != HttpStatus.ok) {
      throw AppUpdateException(
        'Сервер обновлений ответил кодом ${response.statusCode}',
      );
    }

    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map) {
      throw const AppUpdateException('Некорректный файл обновления');
    }
    final json = Map<String, dynamic>.from(decoded);
    final versionCode = (json['versionCode'] as num?)?.toInt();
    final versionName = json['versionName'] as String?;
    final apkUrl = json['apkUrl'] as String?;
    final sha256 = (json['sha256'] as String?)?.trim().toLowerCase();
    if (versionCode == null ||
        versionCode < 1 ||
        versionName == null ||
        versionName.trim().isEmpty ||
        apkUrl == null ||
        apkUrl.trim().isEmpty ||
        sha256 == null ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(sha256)) {
      throw const AppUpdateException('Файл обновления заполнен неверно');
    }

    final appInfo = await _platform.invokeMapMethod<String, dynamic>(
      'getAppInfo',
    );
    final currentVersionCode = (appInfo?['versionCode'] as num?)?.toInt();
    if (currentVersionCode == null || versionCode <= currentVersionCode) {
      return null;
    }

    return AppUpdateInfo(
      versionName: versionName.trim(),
      versionCode: versionCode,
      apkUri: manifestUri.resolve(apkUrl.trim()),
      sha256: sha256,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      releaseNotes: (json['releaseNotes'] as String?)?.trim() ?? '',
      required: json['required'] == true,
    );
  }

  Future<String> download(
    AppUpdateInfo update, {
    required ValueChanged<double?> onProgress,
  }) async {
    final filePath = await _platform.invokeMethod<String>('prepareDownload', {
      'fileName': 'taxi-bgr-${update.versionCode}.apk',
    });
    if (filePath == null || filePath.isEmpty) {
      throw const AppUpdateException('Не удалось подготовить файл обновления');
    }

    final request = http.Request('GET', update.apkUri);
    final response = await _client
        .send(request)
        .timeout(const Duration(seconds: 15));
    if (response.statusCode != HttpStatus.ok) {
      throw AppUpdateException(
        'Не удалось скачать обновление: код ${response.statusCode}',
      );
    }

    final file = File(filePath);
    final sink = file.openWrite();
    var received = 0;
    final total = response.contentLength ?? update.sizeBytes;
    try {
      await for (final chunk in response.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress(total > 0 ? received / total : null);
      }
      await sink.flush();
    } on Object {
      await sink.close();
      await _deleteQuietly(file);
      rethrow;
    }
    await sink.close();

    if (update.sizeBytes > 0 && received != update.sizeBytes) {
      await _deleteQuietly(file);
      throw const AppUpdateException('Файл обновления скачался не полностью');
    }

    final actualHash = await _platform.invokeMethod<String>('sha256', {
      'path': filePath,
    });
    if (actualHash?.toLowerCase() != update.sha256) {
      await _deleteQuietly(file);
      throw const AppUpdateException(
        'Проверка скачанного обновления не пройдена',
      );
    }
    onProgress(1);
    return filePath;
  }

  Future<bool> canRequestPackageInstalls() async {
    return await _platform.invokeMethod<bool>('canInstallPackages') ?? false;
  }

  Future<void> openInstallPermissionSettings() {
    return _platform.invokeMethod<void>('openInstallSettings');
  }

  Future<void> launchInstaller(String filePath) {
    return _platform.invokeMethod<void>('installApk', {'path': filePath});
  }

  void close() {
    _client.close();
  }

  Future<void> _deleteQuietly(File file) async {
    try {
      if (await file.exists()) {
        await file.delete();
      }
    } on Object {
      // A failed update must not be replaced by a cleanup error.
    }
  }
}
