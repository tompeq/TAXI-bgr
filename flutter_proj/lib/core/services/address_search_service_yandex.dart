import 'dart:async';
import 'dart:math' as math;

import 'package:yandex_maps_mapkit/mapkit.dart' as yandex;
import 'package:yandex_maps_mapkit/search.dart' as yandex_search;

import '../../features/map/mapkit_initializer.dart';
import '../data/local_catalog.dart';
import '../models/address_point.dart';
import '../models/address_suggestion.dart';
import '../models/geo_point.dart';
import 'service_zone_resolver.dart';

class AddressSearchService {
  static const _maxSuggestions = 24;
  static const _locationPrefix =
      'Россия, Хабаровский край, Ульчский район, село Богородское';
  static const _searchBounds = yandex.BoundingBox(
    yandex.Point(latitude: 52.34, longitude: 140.34),
    yandex.Point(latitude: 52.46, longitude: 140.49),
  );

  yandex_search.SearchManager? _searchManager;
  yandex_search.SearchSuggestSession? _suggestSession;
  yandex_search.SearchSuggestSessionSuggestListener? _suggestListener;
  yandex_search.SearchSessionSearchListener? _suggestSearchListener;
  yandex_search.SearchSession? _suggestSearchSession;
  yandex_search.SearchSessionSearchListener? _searchListener;
  yandex_search.SearchSession? _searchSession;
  bool _disposed = false;

  List<AddressSuggestion> initialSuggestions() => initialAddressSuggestions();

  List<AddressSuggestion> localSuggestions(String query) =>
      localAddressSuggestions(query);

  Future<List<AddressSuggestion>> suggest(String query) async {
    final normalized = query.trim();
    if (_disposed) {
      return const [];
    }
    final local = normalized.isEmpty
        ? initialAddressSuggestions()
        : localAddressSuggestions(normalized);
    if (normalized.isEmpty) {
      return local;
    }

    try {
      await _ensureReady();
    } on Object {
      return local;
    }
    final searchMatches = _searchSuggestions(normalized);
    final completer = Completer<List<AddressSuggestion>>();
    _suggestListener = yandex_search.SearchSuggestSessionSuggestListener(
      onResponse: (response) {
        if (_disposed || completer.isCompleted) {
          return;
        }
        final results = response.items
            .where(
              (item) =>
                  (item.type == yandex_search.SuggestItemType.Toponym ||
                      item.type == yandex_search.SuggestItemType.Business) &&
                  !item.isWordItem,
            )
            .map(_suggestionFrom)
            .take(_maxSuggestions)
            .toList(growable: false);
        completer.complete(results);
      },
      onError: (_) {
        if (!completer.isCompleted) {
          completer.complete(const []);
        }
      },
    );
    _suggestSession!.suggest(
      _searchBounds,
      yandex_search.SuggestOptions(
        suggestTypes:
            yandex_search.SuggestType.Geo | yandex_search.SuggestType.Biz,
        userPosition: yandex.Point(latitude: 52.3661, longitude: 140.4358),
        strictBounds: true,
      ),
      _suggestListener!,
      text: normalized,
    );
    final hinted = await completer.future;
    final searched = await searchMatches;
    final combined = <AddressSuggestion>[];
    final seen = <String>{};
    for (final suggestion in [...local, ...hinted, ...searched]) {
      final key = '${suggestion.title}|${suggestion.subtitle}'
          .toLowerCase()
          .trim();
      if (seen.add(key)) {
        combined.add(suggestion);
      }
      if (combined.length == _maxSuggestions) {
        break;
      }
    }
    return combined;
  }

  Future<AddressPoint?> resolveSuggestion(AddressSuggestion suggestion) async {
    final uri = suggestion.uri;
    if (uri != null && uri.isNotEmpty) {
      final resolved = await _resolveUri(uri);
      if (resolved != null) {
        return resolved;
      }
    }
    return search(suggestion.searchText);
  }

  Future<AddressPoint?> search(String query) async {
    final normalized = query.trim();
    if (normalized.isEmpty || _disposed) {
      return null;
    }

    await _ensureReady();
    final completer = Completer<AddressPoint?>();
    _searchListener = yandex_search.SearchSessionSearchListener(
      onSearchResponse: (response) {
        if (_disposed || completer.isCompleted) {
          return;
        }
        completer.complete(_firstAddress(response));
      },
      onSearchError: (_) {
        if (!completer.isCompleted) {
          completer.complete(null);
        }
      },
    );
    _searchSession?.cancel();
    _searchSession = _searchManager!.submit(
      const yandex.Geometry.fromBoundingBox(_searchBounds),
      yandex_search.SearchOptions(
        searchTypes:
            yandex_search.SearchType.Geo | yandex_search.SearchType.Biz,
        resultPageSize: _maxSuggestions,
        geometry: true,
        userPosition: yandex.Point(latitude: 52.3661, longitude: 140.4358),
      ),
      _searchListener!,
      text: _scopedQuery(normalized),
    );
    return completer.future;
  }

  Future<AddressPoint?> reverse(GeoPoint point) async {
    if (_disposed) {
      return null;
    }

    await _ensureReady();
    final completer = Completer<AddressPoint?>();
    _searchListener = yandex_search.SearchSessionSearchListener(
      onSearchResponse: (response) {
        if (_disposed || completer.isCompleted) {
          return;
        }
        completer.complete(_firstAddress(response, fallbackPoint: point));
      },
      onSearchError: (_) {
        if (!completer.isCompleted) {
          completer.complete(null);
        }
      },
    );
    _searchSession?.cancel();
    _searchSession = _searchManager!.submitPoint(
      _point(point),
      yandex_search.SearchOptions(
        searchTypes: yandex_search.SearchType.Geo,
        geometry: true,
      ),
      _searchListener!,
      zoom: 18,
    );
    return completer.future;
  }

  void dispose() {
    _disposed = true;
    _suggestSession?.reset();
    _suggestSearchSession?.cancel();
    _searchSession?.cancel();
  }

  Future<void> _ensureReady() async {
    await MapkitInitializer.ensureInitialized();
    _searchManager ??= yandex_search.SearchFactory.instance.createSearchManager(
      yandex_search.SearchManagerType.Online,
    );
    _suggestSession ??= _searchManager!.createSuggestSession();
  }

  AddressSuggestion _suggestionFrom(yandex_search.SuggestItem item) {
    final center = item.center;
    return AddressSuggestion(
      title: item.title.text,
      subtitle: item.subtitle?.text ?? _locationPrefix,
      searchText: item.searchText,
      coordinates: center == null
          ? null
          : GeoPoint(latitude: center.latitude, longitude: center.longitude),
      uri: item.uri,
    );
  }

  Future<AddressPoint?> _resolveUri(String uri) async {
    await _ensureReady();
    final completer = Completer<AddressPoint?>();
    _searchListener = yandex_search.SearchSessionSearchListener(
      onSearchResponse: (response) {
        if (_disposed || completer.isCompleted) {
          return;
        }
        completer.complete(_firstAddress(response));
      },
      onSearchError: (_) {
        if (!completer.isCompleted) {
          completer.complete(null);
        }
      },
    );
    _searchSession?.cancel();
    _searchSession = _searchManager!.resolveURI(
      yandex_search.SearchOptions(),
      _searchListener!,
      uri: uri,
    );
    return completer.future;
  }

  Future<List<AddressSuggestion>> _searchSuggestions(String query) {
    final completer = Completer<List<AddressSuggestion>>();
    _suggestSearchListener = yandex_search.SearchSessionSearchListener(
      onSearchResponse: (response) {
        if (_disposed || completer.isCompleted) {
          return;
        }
        final suggestions = _allGeoObjects(response.collection)
            .map(_suggestionFromObject)
            .whereType<AddressSuggestion>()
            .take(_maxSuggestions)
            .toList(growable: false);
        completer.complete(suggestions);
      },
      onSearchError: (_) {
        if (!completer.isCompleted) {
          completer.complete(const []);
        }
      },
    );
    _suggestSearchSession?.cancel();
    _suggestSearchSession = _searchManager!.submit(
      const yandex.Geometry.fromBoundingBox(_searchBounds),
      yandex_search.SearchOptions(
        searchTypes:
            yandex_search.SearchType.Geo | yandex_search.SearchType.Biz,
        resultPageSize: _maxSuggestions,
        geometry: true,
        userPosition: yandex.Point(latitude: 52.3661, longitude: 140.4358),
      ),
      _suggestSearchListener!,
      text: query,
    );
    return completer.future;
  }

  AddressSuggestion? _suggestionFromObject(yandex.GeoObject object) {
    final metadata = object.metadataContainer.get(
      yandex_search.SearchToponymObjectMetadata.factory,
    );
    final geometryPoint = object.geometry
        .map((geometry) => geometry.asPoint())
        .whereType<yandex.Point>()
        .firstOrNull;
    if (metadata == null) {
      final title = (object.name ?? '').trim();
      if (title.isEmpty || geometryPoint == null) {
        return null;
      }
      return AddressSuggestion(
        title: title,
        subtitle: (object.descriptionText ?? _locationPrefix).trim(),
        searchText: title,
        coordinates: GeoPoint(
          latitude: geometryPoint.latitude,
          longitude: geometryPoint.longitude,
        ),
      );
    }
    if (!_hasStreetOrHouse(metadata.address.components)) {
      return null;
    }
    final formatted = _formatAddress(metadata.address.components);
    final title = formatted.$1.isEmpty
        ? (object.name ?? '').trim()
        : formatted.$1;
    if (title.isEmpty) {
      return null;
    }
    final point = geometryPoint ?? metadata.balloonPoint;
    return AddressSuggestion(
      title: title,
      subtitle: formatted.$2.isEmpty
          ? (object.descriptionText ?? _locationPrefix)
          : formatted.$2,
      searchText: title,
      coordinates: GeoPoint(
        latitude: point.latitude,
        longitude: point.longitude,
      ),
    );
  }

  AddressPoint? _firstAddress(
    yandex_search.SearchResponse response, {
    GeoPoint? fallbackPoint,
  }) {
    final object = _bestGeoObject(
      response.collection,
      requestedPoint: fallbackPoint,
    );
    if (object == null) {
      return null;
    }
    final metadata = object.metadataContainer.get(
      yandex_search.SearchToponymObjectMetadata.factory,
    );
    if (fallbackPoint != null &&
        metadata != null &&
        !_hasUsableAddress(metadata.address)) {
      return null;
    }

    final geometryPoint = object.geometry
        .map((geometry) => geometry.asPoint())
        .whereType<yandex.Point>()
        .firstOrNull;
    final resolvedPoint = geometryPoint ?? metadata?.balloonPoint;
    final point =
        fallbackPoint ??
        (resolvedPoint == null
            ? null
            : GeoPoint(
                latitude: resolvedPoint.latitude,
                longitude: resolvedPoint.longitude,
              ));
    if (point == null) {
      return null;
    }

    final componentAddress = metadata == null
        ? null
        : _formatAddress(metadata.address.components);
    final compactFullAddress = _compactAddress(
      metadata?.address.formattedAddress ?? '',
    );
    final title =
        (componentAddress?.$1.isNotEmpty == true
                ? componentAddress!.$1
                : compactFullAddress.isNotEmpty
                ? compactFullAddress
                : object.name ?? '')
            .trim();
    final subtitle =
        (componentAddress?.$2.isNotEmpty == true
                ? componentAddress!.$2
                : object.descriptionText ?? '')
            .trim();
    return _addressFrom(
      point,
      title: title.isEmpty ? 'Точка на карте' : title,
      subtitle: subtitle.isEmpty ? _locationPrefix : subtitle,
    );
  }

  yandex.GeoObject? _bestGeoObject(
    yandex.GeoObjectCollection collection, {
    GeoPoint? requestedPoint,
  }) {
    final objects = _allGeoObjects(collection).toList(growable: false);
    if (objects.isEmpty) {
      return null;
    }
    if (requestedPoint == null) {
      return objects.first;
    }

    final ranked =
        <({yandex.GeoObject object, double score, double distance})>[];
    for (final object in objects) {
      final metadata = object.metadataContainer.get(
        yandex_search.SearchToponymObjectMetadata.factory,
      );
      if (metadata == null) {
        continue;
      }
      final components = metadata.address.components;
      final hasHouse = _hasKind(
        components,
        yandex_search.SearchAddressComponentKind.House,
      );
      final hasStreet = _hasKind(
        components,
        yandex_search.SearchAddressComponentKind.Street,
      );
      if (!hasStreet && !hasHouse) {
        continue;
      }
      final balloonPoint = metadata.balloonPoint;
      final distance = _distanceMeters(
        requestedPoint,
        GeoPoint(
          latitude: balloonPoint.latitude,
          longitude: balloonPoint.longitude,
        ),
      );
      ranked.add((
        object: object,
        score: distance - (hasHouse ? 4 : 0),
        distance: distance,
      ));
    }
    ranked.sort((first, second) => first.score.compareTo(second.score));
    final closest = ranked.firstOrNull;
    if (closest != null && closest.distance <= 120) {
      return closest.object;
    }
    return objects.where(_looksLikeStreetAddress).firstOrNull;
  }

  Iterable<yandex.GeoObject> _allGeoObjects(
    yandex.GeoObjectCollection collection,
  ) sync* {
    for (final child in collection.children) {
      final object = child.asGeoObject();
      if (object != null) {
        yield object;
      }
      final nested = child.asGeoObjectCollection();
      if (nested != null) {
        yield* _allGeoObjects(nested);
      }
    }
  }

  bool _hasStreetOrHouse(
    List<yandex_search.SearchAddressComponent> components,
  ) {
    return _hasKind(
          components,
          yandex_search.SearchAddressComponentKind.Street,
        ) ||
        _hasKind(components, yandex_search.SearchAddressComponentKind.House);
  }

  bool _hasUsableAddress(yandex_search.SearchAddress address) {
    return _hasStreetOrHouse(address.components) ||
        _looksLikeAddressText(address.formattedAddress);
  }

  bool _looksLikeStreetAddress(yandex.GeoObject object) {
    return _looksLikeAddressText(
      '${object.name ?? ''} ${object.descriptionText ?? ''}',
    );
  }

  bool _looksLikeAddressText(String value) {
    final normalized = value.toLowerCase();
    return normalized.contains('улиц') ||
        normalized.contains('переул') ||
        normalized.contains(' пер.') ||
        normalized.contains('проезд') ||
        normalized.contains('шоссе');
  }

  bool _hasKind(
    List<yandex_search.SearchAddressComponent> components,
    yandex_search.SearchAddressComponentKind kind,
  ) {
    return components.any((component) => component.kinds.contains(kind));
  }

  (String, String) _formatAddress(
    List<yandex_search.SearchAddressComponent> components,
  ) {
    String? componentName(yandex_search.SearchAddressComponentKind kind) {
      return components
          .where((component) => component.kinds.contains(kind))
          .map((component) => component.name.trim())
          .where((name) => name.isNotEmpty)
          .firstOrNull;
    }

    final street = componentName(
      yandex_search.SearchAddressComponentKind.Street,
    );
    final house = componentName(yandex_search.SearchAddressComponentKind.House);
    final locality = componentName(
      yandex_search.SearchAddressComponentKind.Locality,
    );
    final area = componentName(yandex_search.SearchAddressComponentKind.Area);

    final title = [street, house].whereType<String>().join(', ');
    final subtitle = [
      locality,
      area == locality ? null : area,
    ].whereType<String>().join(', ');
    return (title, subtitle);
  }

  String _compactAddress(String formattedAddress) {
    final parts = formattedAddress
        .split(',')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    final streetIndex = parts.indexWhere(_looksLikeAddressText);
    if (streetIndex == -1) {
      return '';
    }
    return parts.skip(streetIndex).take(2).join(', ');
  }

  double _distanceMeters(GeoPoint first, GeoPoint second) {
    const earthRadius = 6371000.0;
    final firstLatitude = _radians(first.latitude);
    final secondLatitude = _radians(second.latitude);
    final latitudeDelta = secondLatitude - firstLatitude;
    final longitudeDelta = _radians(second.longitude - first.longitude);
    final a =
        math.sin(latitudeDelta / 2) * math.sin(latitudeDelta / 2) +
        math.cos(firstLatitude) *
            math.cos(secondLatitude) *
            math.sin(longitudeDelta / 2) *
            math.sin(longitudeDelta / 2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  double _radians(double degrees) => degrees * math.pi / 180;

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

  String _scopedQuery(String query) {
    final normalized = query.toLowerCase();
    if (normalized.contains('богородск')) {
      return query;
    }
    return '$_locationPrefix, $query';
  }

  yandex.Point _point(GeoPoint point) {
    return yandex.Point(latitude: point.latitude, longitude: point.longitude);
  }
}
