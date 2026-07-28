import 'dart:convert';
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
    if (response.statusCode != 200) {
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
    final fileName = 'taxi-bgr-${update.versionCode}.apk';
    await _platform.invokeMapMethod<String, dynamic>('startUpdateDownload', {
      'url': update.apkUri.toString(),
      'fileName': fileName,
      'versionCode': update.versionCode,
    });

    while (true) {
      final state = await _platform.invokeMapMethod<String, dynamic>(
        'getUpdateDownload',
      );
      final status = state?['status'] as String? ?? 'missing';
      final downloadedBytes = (state?['downloadedBytes'] as num?)?.toInt() ?? 0;
      final totalBytes = (state?['totalBytes'] as num?)?.toInt() ?? 0;
      final progressTotal = totalBytes > 0 ? totalBytes : update.sizeBytes;
      onProgress(
        progressTotal > 0
            ? (downloadedBytes / progressTotal).clamp(0, 1)
            : null,
      );

      switch (status) {
        case 'pending':
        case 'running':
        case 'paused':
          await Future<void>.delayed(const Duration(seconds: 1));
          continue;
        case 'successful':
          final filePath = state?['path'] as String?;
          if (filePath == null || filePath.isEmpty) {
            throw const AppUpdateException(
              'Не удалось найти скачанное обновление',
            );
          }
          if (update.sizeBytes > 0 && downloadedBytes != update.sizeBytes) {
            await _discardDownload();
            throw const AppUpdateException(
              'Файл обновления скачался не полностью',
            );
          }
          final actualHash = await _platform.invokeMethod<String>('sha256', {
            'path': filePath,
          });
          if (actualHash?.toLowerCase() != update.sha256) {
            await _discardDownload();
            throw const AppUpdateException(
              'Проверка скачанного обновления не пройдена',
            );
          }
          onProgress(1);
          return filePath;
        case 'failed':
          final reason = (state?['reason'] as num?)?.toInt();
          throw AppUpdateException(
            reason == null
                ? 'Не удалось скачать обновление'
                : 'Не удалось скачать обновление (код $reason)',
          );
        default:
          throw const AppUpdateException(
            'Системная загрузка обновления была потеряна',
          );
      }
    }
  }

  Future<void> _discardDownload() {
    return _platform.invokeMethod<void>('discardUpdateDownload');
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
}
