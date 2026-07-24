import 'package:flutter/material.dart';

ThemeData buildAppTheme() {
  const seed = Color(0xFFFFCC00);
  const text = Color(0xFF1F1F1F);

  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
      primary: seed,
      onPrimary: text,
      secondary: const Color(0xFF2F3437),
    ),
    scaffoldBackgroundColor: const Color(0xFFF5F4EF),
    appBarTheme: const AppBarTheme(
      centerTitle: false,
      elevation: 0,
      backgroundColor: Color(0xFFF5F4EF),
      foregroundColor: text,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: seed,
        foregroundColor: text,
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: text,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Color(0xFFE2E2DD)),
      ),
      margin: EdgeInsets.zero,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      selectedColor: const Color(0xFFFFE680),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      side: const BorderSide(color: Color(0xFFE6E2D6)),
      labelStyle: const TextStyle(color: text),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFD8D8D0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: Color(0xFFD8D8D0)),
      ),
    ),
  );
}
