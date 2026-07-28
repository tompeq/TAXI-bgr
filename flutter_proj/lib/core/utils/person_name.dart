String personFirstName(String value, {bool familyNameFirst = false}) {
  final parts = value
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList(growable: false);
  if (parts.isEmpty) return '';
  return familyNameFirst && parts.length >= 2 ? parts[1] : parts.first;
}
