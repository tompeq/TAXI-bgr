import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_proj/core/utils/person_name.dart';

void main() {
  test('keeps a passenger first name unchanged', () {
    expect(personFirstName('Никита'), 'Никита');
  });

  test('extracts a first name from a full Russian name', () {
    expect(
      personFirstName('Иванова Татьяна Сергеевна', familyNameFirst: true),
      'Татьяна',
    );
  });

  test('normalizes extra whitespace', () {
    expect(
      personFirstName(
        '  Иванова   Татьяна   Сергеевна  ',
        familyNameFirst: true,
      ),
      'Татьяна',
    );
  });

  test('keeps the first word for a passenger with a two-part name', () {
    expect(personFirstName('Никита Петров'), 'Никита');
  });

  test('extracts driver first name from a two-part full name', () {
    expect(
      personFirstName('Иванова Татьяна', familyNameFirst: true),
      'Татьяна',
    );
  });
}
