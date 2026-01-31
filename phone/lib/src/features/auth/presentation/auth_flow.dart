import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/controllers/auth_controller.dart';
import 'login_screen.dart';
import 'signup_screen.dart';

class AuthFlow extends ConsumerStatefulWidget {
  const AuthFlow({super.key});

  @override
  ConsumerState<AuthFlow> createState() => _AuthFlowState();
}

class _AuthFlowState extends ConsumerState<AuthFlow> {
  bool _showLogin = true;

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (previous, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(next.error.toString())));
      }
    });

    final authState = ref.watch(authControllerProvider);
    final isProcessing = authState.isLoading;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          _BackgroundArtwork(showLogin: _showLogin),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 720;

                Widget buildCard() {
                  return ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Card(
                      elevation: 4,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: _showLogin
                              ? LoginScreen(
                                  key: const ValueKey('login'),
                                  onSignupTap: () => setState(() {
                                    _showLogin = false;
                                  }),
                                  onGoogleTap: _handleGoogleSignIn,
                                )
                              : SignupScreen(
                                  key: const ValueKey('signup'),
                                  onLoginTap: () => setState(() {
                                    _showLogin = true;
                                  }),
                                ),
                        ),
                      ),
                    ),
                  );
                }

                if (isWide) {
                  return Row(
                    children: [
                      Expanded(
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: buildCard(),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: _PromoPanel(
                            onToggle: _toggleFlow,
                            showLogin: _showLogin,
                          ),
                        ),
                      ),
                    ],
                  );
                }

                return Column(
                  children: [
                    Expanded(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 24,
                          ),
                          child: buildCard(),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: _PromoPanel(
                        onToggle: _toggleFlow,
                        showLogin: _showLogin,
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          if (isProcessing)
            const ColoredBox(
              color: Colors.black38,
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  void _toggleFlow() {
    setState(() {
      _showLogin = !_showLogin;
    });
  }

  Future<void> _handleGoogleSignIn() async {
    await ref.read(authControllerProvider.notifier).signInWithGoogle();
  }
}

class _PromoPanel extends StatelessWidget {
  const _PromoPanel({required this.onToggle, required this.showLogin});

  final VoidCallback onToggle;
  final bool showLogin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          showLogin ? 'Need an account?' : 'Already with us?',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          showLogin
              ? 'Create a profile and sync your conversations and notes across Zen AI.'
              : 'Log back in to continue your conversations on the go.',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 16),
        TextButton(
          onPressed: onToggle,
          child: Text(showLogin ? 'Sign up instead' : 'Use login instead'),
        ),
      ],
    );
  }
}

class _BackgroundArtwork extends StatelessWidget {
  const _BackgroundArtwork({required this.showLogin});

  final bool showLogin;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
