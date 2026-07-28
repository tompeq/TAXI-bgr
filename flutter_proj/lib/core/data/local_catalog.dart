import '../models/address_point.dart';
import '../models/address_suggestion.dart';
import '../models/geo_point.dart';

const localAddressCatalog = <AddressPoint>[
  AddressPoint(
    id: 'kirova-12',
    title: 'Кирова, 12',
    subtitle: 'центр, верхний БГР',
    zone: ServiceZone.upperBgr,
    coordinates: GeoPoint(latitude: 52.3661, longitude: 140.4358),
  ),
  AddressPoint(
    id: 'partizanskaya-38',
    title: 'Партизанская, 38',
    subtitle: 'локальный справочник БГР',
    zone: ServiceZone.upperBgr,
    coordinates: GeoPoint(latitude: 52.3639, longitude: 140.4299),
  ),
  AddressPoint(
    id: 'sovetskaya-7',
    title: 'Советская, 7',
    subtitle: 'верхний БГР',
    zone: ServiceZone.upperBgr,
    coordinates: GeoPoint(latitude: 52.3692, longitude: 140.4383),
  ),
  AddressPoint(
    id: 'kombinat',
    title: 'Комбинат',
    subtitle: 'фиксированная зона',
    zone: ServiceZone.kombinat,
    coordinates: GeoPoint(latitude: 52.3585, longitude: 140.4217),
  ),
  AddressPoint(
    id: 'lower-harbor',
    title: 'Нижняя Гавань',
    subtitle: 'фиксированная зона',
    zone: ServiceZone.lowerHarbor,
    coordinates: GeoPoint(latitude: 52.43778, longitude: 140.42528),
  ),
  AddressPoint(
    id: 'quarry',
    title: 'Карьер',
    subtitle: 'фиксированная зона',
    zone: ServiceZone.quarry,
    coordinates: GeoPoint(latitude: 52.43720, longitude: 140.45700),
  ),
];

const mapLandmarks = <AddressPoint>[
  AddressPoint(
    id: 'lower-harbor',
    title: 'Нижняя Гавань',
    subtitle: 'фиксированная зона',
    zone: ServiceZone.lowerHarbor,
    coordinates: GeoPoint(latitude: 52.43778, longitude: 140.42528),
  ),
  AddressPoint(
    id: 'quarry',
    title: 'Карьер',
    subtitle: 'фиксированная зона',
    zone: ServiceZone.quarry,
    coordinates: GeoPoint(latitude: 52.43720, longitude: 140.45700),
  ),
];

const popularAddressIds = <String>['kirova-12', 'partizanskaya-38', 'kombinat'];

const bogorodskoyeCenter = GeoPoint(latitude: 52.3661, longitude: 140.4358);

const _locality = 'село Богородское, Ульчский район';

class _LocalSuggestionEntry {
  const _LocalSuggestionEntry({
    required this.title,
    required this.searchText,
    this.aliases = const [],
  });

  final String title;
  final String searchText;
  final List<String> aliases;
}

// A compact local index keeps the first suggestions useful even if the online
// map search has not answered yet. Selecting an entry still resolves it in
// Yandex Maps, so it does not invent a house coordinate.
const _localSuggestionEntries = <_LocalSuggestionEntry>[
  _LocalSuggestionEntry(
    title: '30 лет Победы',
    searchText: 'улица 30 лет Победы, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Амурская',
    searchText: 'улица Амурская, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Аэропорт',
    searchText: 'территория Аэропорт, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Восточная',
    searchText: 'улица Восточная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Заречная',
    searchText: 'улица Заречная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Кирова',
    searchText: 'улица Кирова, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Ключевая',
    searchText: 'улица Ключевая, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Колхозная',
    searchText: 'улица Колхозная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Комсомольская',
    searchText: 'улица Комсомольская, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Некрасова',
    searchText: 'улица Некрасова, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Новый переулок',
    searchText: 'Новый переулок, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Октябрьская',
    searchText: 'улица Октябрьская, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Парковая',
    searchText: 'улица Парковая, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Партизанская',
    searchText: 'улица Партизанская, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Переулок Промкомбината',
    searchText: 'переулок Промкомбината, село Богородское, Ульчский район',
    aliases: ['промкомбинат'],
  ),
  _LocalSuggestionEntry(
    title: 'Почтовая',
    searchText: 'улица Почтовая, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Пушкина',
    searchText: 'улица Пушкина, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Рабочая',
    searchText: 'улица Рабочая, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Свердлова',
    searchText: 'улица Свердлова, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Северная',
    searchText: 'улица Северная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Сластина',
    searchText: 'улица Сластина, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Советская',
    searchText: 'улица Советская, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Спортивная',
    searchText: 'улица Спортивная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Строительная',
    searchText: 'улица Строительная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Студенческая',
    searchText: 'улица Студенческая, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Таежная',
    searchText: 'улица Таежная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Школьная',
    searchText: 'улица Школьная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Юбилейная',
    searchText: 'улица Юбилейная, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Мирный переулок',
    searchText: 'Мирный переулок, село Богородское, Ульчский район',
  ),
  _LocalSuggestionEntry(
    title: 'Поликлиника',
    searchText: 'поликлиника, село Богородское, Ульчский район',
    aliases: ['больница', 'медицинский пункт'],
  ),
];

List<AddressSuggestion> initialAddressSuggestions({int limit = 10}) {
  final suggestions = <AddressSuggestion>[
    ...popularAddresses.map(_suggestionFromAddress),
    ...localAddressCatalog
        .where((address) => !popularAddressIds.contains(address.id))
        .map(_suggestionFromAddress),
    ..._localSuggestionEntries.map(_suggestionFromEntry),
  ];
  return _uniqueSuggestions(suggestions).take(limit).toList(growable: false);
}

List<AddressSuggestion> localAddressSuggestions(
  String query, {
  int limit = 24,
}) {
  final normalized = _normalizeForSearch(query);
  if (normalized.isEmpty) {
    return initialAddressSuggestions(limit: limit);
  }

  final terms = normalized
      .split(' ')
      .where(
        (term) => term.isNotEmpty && !RegExp(r'^\d+[а-яa-z]?$').hasMatch(term),
      )
      .toList(growable: false);
  final house = _trailingHouseNumber(normalized);
  final ranked = <({AddressSuggestion suggestion, int score})>[];

  for (final address in localAddressCatalog) {
    final haystack = _normalizeForSearch(
      '${address.title} ${address.subtitle}',
    );
    final score = _matchScore(haystack, terms);
    if (score != null) {
      ranked.add((
        suggestion: _suggestionFromAddress(address),
        score: score + 40,
      ));
    }
  }

  for (final entry in _localSuggestionEntries) {
    final haystack = _normalizeForSearch(
      '${entry.title} ${entry.searchText} ${entry.aliases.join(' ')}',
    );
    final score = _matchScore(haystack, terms);
    if (score == null) {
      continue;
    }
    ranked.add((
      suggestion: _suggestionFromEntry(entry, house: house),
      score: score,
    ));
  }

  ranked.sort((first, second) => second.score.compareTo(first.score));
  return _uniqueSuggestions(
    ranked.map((entry) => entry.suggestion),
  ).take(limit).toList(growable: false);
}

AddressSuggestion _suggestionFromAddress(AddressPoint address) {
  return AddressSuggestion(
    title: address.title,
    subtitle: address.subtitle,
    searchText: '$address.title, $_locality',
    coordinates: address.coordinates,
  );
}

AddressSuggestion _suggestionFromEntry(
  _LocalSuggestionEntry entry, {
  String? house,
}) {
  final title = house == null ? entry.title : '${entry.title}, $house';
  final searchText = house == null
      ? entry.searchText
      : '${entry.searchText}, $house';
  return AddressSuggestion(
    title: title,
    subtitle: _locality,
    searchText: searchText,
  );
}

int? _matchScore(String haystack, List<String> terms) {
  if (terms.isEmpty) {
    return 1;
  }
  var score = 0;
  for (final term in terms) {
    final index = haystack.indexOf(term);
    if (index == -1) {
      return null;
    }
    score += index == 0 || haystack.substring(0, index).endsWith(' ') ? 30 : 12;
  }
  return score;
}

String? _trailingHouseNumber(String normalizedQuery) {
  final tokens = normalizedQuery.split(' ').where((token) => token.isNotEmpty);
  if (tokens.length < 2) {
    return null;
  }
  final last = tokens.last;
  return RegExp(r'^\d+[а-яa-z]?(?:[/-]\d+[а-яa-z]?)?$').hasMatch(last)
      ? last
      : null;
}

String _normalizeForSearch(String value) {
  return value
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replaceAll(RegExp(r'[^a-zа-я0-9]+'), ' ')
      .trim();
}

Iterable<AddressSuggestion> _uniqueSuggestions(
  Iterable<AddressSuggestion> suggestions,
) sync* {
  final seen = <String>{};
  for (final suggestion in suggestions) {
    final key = '${suggestion.title}|${suggestion.subtitle}'.toLowerCase();
    if (seen.add(key)) {
      yield suggestion;
    }
  }
}

List<AddressPoint> get popularAddresses {
  return localAddressCatalog
      .where((address) => popularAddressIds.contains(address.id))
      .toList(growable: false);
}
