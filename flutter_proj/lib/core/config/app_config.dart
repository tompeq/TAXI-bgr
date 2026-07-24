class AppConfig {
  const AppConfig._();

  static const mapkitApiKey = String.fromEnvironment('MAPKIT_API_KEY');
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );
  static const updateManifestUrl = String.fromEnvironment(
    'UPDATE_MANIFEST_URL',
    defaultValue: '',
  );
  static const isInterfaceDemo = bool.fromEnvironment(
    'INTERFACE_DEMO_MODE',
    defaultValue: false,
  );

  static bool get hasMapkitApiKey => mapkitApiKey.trim().isNotEmpty;
  static bool get hasUpdateManifest => updateManifestUrl.trim().isNotEmpty;
}
