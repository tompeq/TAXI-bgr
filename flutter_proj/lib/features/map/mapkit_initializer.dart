import 'package:yandex_maps_mapkit/init.dart' as yandex_init;

import '../../core/config/app_config.dart';

class MapkitInitializer {
  const MapkitInitializer._();

  static Future<void>? _initialization;

  static Future<void> ensureInitialized() {
    return _initialization ??= yandex_init.initMapkit(
      apiKey: AppConfig.mapkitApiKey,
      locale: 'ru_RU',
    );
  }
}
