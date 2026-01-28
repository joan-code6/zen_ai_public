import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/controllers/auth_controller.dart';
import 'features/auth/presentation/auth_flow.dart';
import 'features/home/presentation/home_shell.dart';
import 'features/settings/controllers/theme_controller.dart';
import 'shared/widgets/app_error_view.dart';
import 'shared/widgets/app_loading_view.dart';

class ZenPhoneApp extends ConsumerWidget {
  const ZenPhoneApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeModeState = ref.watch(themeControllerProvider);
    final themeMode = themeModeState.value ?? ThemeMode.light;

    return MaterialApp(
      title: 'Zen AI Mobile',
      debugShowCheckedModeBanner: false,
      theme: _buildLightTheme(),
      darkTheme: _buildDarkTheme(),
      themeMode: themeMode,
      home: const _AppRoot(),
    );
  }
}

ThemeData _buildLightTheme() {
  final base = ThemeData(
    colorSchemeSeed: const Color(0xFF1E88E5),
    useMaterial3: true,
    brightness: Brightness.light,
  );
  return base.copyWith(
    scaffoldBackgroundColor: const Color(0xFFF5F7FB),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: Colors.white,
      foregroundColor: const Color(0xFF1F2933),
      elevation: 0,
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF1E88E5)),
      ),
    ),
  );
}

ThemeData _buildDarkTheme() {
  final base = ThemeData(
    colorSchemeSeed: const Color(0xFF90CAF9),
    useMaterial3: true,
    brightness: Brightness.dark,
  );
  return base.copyWith(
    scaffoldBackgroundColor: const Color(0xFF0F172A),
    appBarTheme: base.appBarTheme.copyWith(
      backgroundColor: const Color(0xFF111827),
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      filled: true,
      fillColor: const Color(0xFF1F2937),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: Colors.blueGrey.shade700),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF90CAF9)),
      ),
    ),
  );
}

class _AppRoot extends ConsumerWidget {
  const _AppRoot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    return authState.when(
      loading: () {
        final cached = authState.asData?.value;
        if (cached != null) {
          final session = cached.session;
          if (session == null) {
            return const AuthFlow();
          }
          return HomeShell(session: session);
        }
        return const AppLoadingView(message: 'Connecting to Zen AI…');
      },
      error: (error, stack) => AppErrorView(
        title: 'Something went wrong',
        message: error.toString(),
        onRetry: () => ref.refresh(authControllerProvider),
      ),
      data: (state) {
        final session = state.session;
        if (session == null) {
          return const AuthFlow();
        }
        return HomeShell(session: session);
      },
    );
  }
}
