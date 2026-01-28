import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

final themeControllerProvider =
    AsyncNotifierProvider<ThemeController, ThemeMode>(ThemeController.new);

class ThemeController extends AsyncNotifier<ThemeMode> {
  static const _prefsKey = 'zen_theme_mode';
  late SharedPreferences _preferences;

  @override
  Future<ThemeMode> build() async {
    _preferences = await SharedPreferences.getInstance();
    final stored = _preferences.getString(_prefsKey);
    switch (stored) {
      case 'dark':
        return ThemeMode.dark;
      case 'system':
        return ThemeMode.system;
      case 'light':
      default:
        return ThemeMode.light;
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = AsyncValue.data(mode);
    await _preferences.setString(_prefsKey, mode.name);
  }
}
