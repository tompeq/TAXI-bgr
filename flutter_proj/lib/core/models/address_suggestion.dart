import 'geo_point.dart';

class AddressSuggestion {
  const AddressSuggestion({
    required this.title,
    required this.subtitle,
    required this.searchText,
    this.coordinates,
    this.uri,
  });

  final String title;
  final String subtitle;
  final String searchText;
  final GeoPoint? coordinates;
  final String? uri;
}
