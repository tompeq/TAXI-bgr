String? normalizePhoneNumber(String input) {
  var digits = input.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.length == 11 && digits.startsWith('8')) {
    digits = '7${digits.substring(1)}';
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    return null;
  }
  return '+$digits';
}
