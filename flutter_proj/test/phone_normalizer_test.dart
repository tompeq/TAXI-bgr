import 'package:flutter_proj/core/auth/phone_normalizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizes common Russian phone formats', () {
    expect(normalizePhoneNumber('+7 914 555-01-23'), '+79145550123');
    expect(normalizePhoneNumber('8 (914) 555-01-23'), '+79145550123');
  });

  test('rejects invalid phone numbers', () {
    expect(normalizePhoneNumber('123'), isNull);
    expect(normalizePhoneNumber('00000000000'), isNull);
  });
}
