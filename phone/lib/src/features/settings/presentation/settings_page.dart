import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/controllers/auth_controller.dart';
import '../../auth/data/auth_models.dart';
import '../controllers/theme_controller.dart';
import 'device_pairing_screen.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key, required this.session});

  final AuthSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: const CloseButton(),
      ),
      body: SettingsView(session: session),
    );
  }
}

class SettingsSheet extends ConsumerWidget {
  const SettingsSheet({super.key, required this.session});

  final AuthSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        ),
        child: Material(
          color: theme.colorScheme.surface,
          elevation: 8,
          borderRadius: BorderRadius.circular(24),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final maxHeight = MediaQuery.of(context).size.height * 0.85;
                return ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxHeight),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 20,
                        ),
                        child: Row(
                          children: [
                            Text(
                              'Settings',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Spacer(),
                            IconButton(
                              tooltip: 'Close',
                              onPressed: () => Navigator.of(context).pop(),
                              icon: const Icon(Icons.close_rounded),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      Flexible(
                        child: SettingsView(session: session),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class SettingsView extends ConsumerWidget {
  const SettingsView({super.key, required this.session});

  final AuthSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final themeModeAsync = ref.watch(themeControllerProvider);
    final isDarkMode = themeModeAsync.value == ThemeMode.dark;
    final themeController = ref.read(themeControllerProvider.notifier);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Card(
          child: ListTile(
            leading: CircleAvatar(
              child: Text(
                session.email.isNotEmpty
                    ? session.email[0].toUpperCase()
                    : '?',
              ),
            ),
            title: Text(
              session.displayName?.isNotEmpty == true
                  ? session.displayName!
                  : session.email,
            ),
            subtitle: Text('UID: ${session.uid}'),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Appearance',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: SwitchListTile.adaptive(
            value: isDarkMode,
            onChanged: themeModeAsync.isLoading
                ? null
                : (value) => themeController
                    .setThemeMode(value ? ThemeMode.dark : ThemeMode.light),
            title: const Text('Dark mode'),
            subtitle: const Text('Reduce glare with a darker theme'),
            secondary: const Icon(Icons.dark_mode_outlined),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'Account',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.verified_user_outlined),
                title: const Text('Authentication provider'),
                subtitle: Text(session.provider.name),
              ),
              const Divider(height: 0),
              ListTile(
                leading: const Icon(Icons.devices_other),
                title: const Text('Connect e-ink display'),
                subtitle: const Text('Provision over Bluetooth and link it to this account'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => DevicePairingScreen(session: session),
                  ),
                ),
              ),
              const Divider(height: 0),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sign out'),
                onTap: () => ref.read(authControllerProvider.notifier).signOut(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Text(
          'About',
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('Zen AI Mobile'),
            subtitle: const Text('Version 1.0.0'),
          ),
        ),
      ],
    );
  }
}
