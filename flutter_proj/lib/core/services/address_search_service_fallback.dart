import '../data/local_catalog.dart';
import '../models/address_point.dart';
import '../models/address_suggestion.dart';
import '../models/geo_point.dart';
import 'service_zone_resolver.dart';

class AddressSearchService {
  List<AddressSuggestion> initialSuggestions() => initialAddressSuggestions();

  List<AddressSuggestion> localSuggestions(String query) =>
      localAddressSuggestions(query);

  Future<List<AddressSuggestion>> suggest(String query) async {
    return localAddressSuggestions(query);
  }

  Future<AddressPoint?> resolveSuggestion(AddressSuggestion suggestion) async {
    final point = suggestion.coordinates;
    if (point == null) {
      return search(suggestion.searchText);
    }
    return _addressFrom(
      point,
      title: suggestion.title,
      subtitle: suggestion.subtitle,
    );
  }

  Future<AddressPoint?> search(String query) async {
    final suggestion = localAddressSuggestions(
      query,
    ).where((candidate) => candidate.coordinates != null).firstOrNull;
    if (suggestion == null) {
      return null;
    }
    return resolveSuggestion(suggestion);
  }

  Future<AddressPoint?> reverse(GeoPoint point) async {
    return _addressFrom(
      point,
      title: 'Точка на карте',
      subtitle: 'село Богородское, Ульчский район',
    );
  }

  void dispose() {}

  AddressPoint _addressFrom(
    GeoPoint point, {
    required String title,
    required String subtitle,
  }) {
    return AddressPoint(
      id: 'map-${point.latitude}-${point.longitude}',
      title: title,
      subtitle: subtitle,
      zone: ServiceZoneResolver.resolve(point, address: '$title $subtitle'),
      coordinates: point,
    );
  }
}
