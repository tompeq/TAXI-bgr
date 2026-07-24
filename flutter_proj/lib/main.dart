import 'package:flutter/material.dart';

import 'app/taxi_bgr_app.dart';
import 'core/config/app_config.dart';
import 'core/notifications/push_notification_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (!AppConfig.isInterfaceDemo) {
    registerBackgroundPushHandler();
  }
  runApp(const TaxiBgrApp());
}
