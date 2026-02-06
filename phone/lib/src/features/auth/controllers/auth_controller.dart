import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/providers.dart';
import '../../../data/api_exception.dart';
import '../data/auth_models.dart';
import '../data/auth_repository.dart';

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthState {
  const AuthState({this.session, this.isProcessing = false});

  final AuthSession? session;
  final bool isProcessing;

  AuthState copyWith({AuthSession? session, bool? isProcessing}) {
    return AuthState(
      session: session ?? this.session,
      isProcessing: isProcessing ?? this.isProcessing,
    );
  }
}

class AuthController extends AsyncNotifier<AuthState> {
  static const _sessionStorageKey = 'zen_phone_auth_session';

  late final AuthRepository _repository;
  late final SharedPreferences _prefs;
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: ['email']);

  AuthSession? get currentSession => state.value?.session;

  @override
  Future<AuthState> build() async {
    // Ensure the backend config is loaded before instantiating the repository.
    await ref.watch(backendConfigProvider.future);
    _repository = ref.read(authRepositoryProvider);
    _prefs = await SharedPreferences.getInstance();

    final storedSession = AuthSession.tryDeserialize(
      _prefs.getString(_sessionStorageKey),
    );

    if (storedSession == null) {
      return const AuthState(session: null);
    }

    if (storedSession.idToken == null) {
      // Session without idToken: trust the stored UID/email.
      return AuthState(session: storedSession);
    }

    try {
      final verified = await _repository.verifyToken(storedSession.idToken!);
      final refreshed = storedSession.copyWith(
        uid: verified.uid,
        email: verified.email ?? storedSession.email,
      );
      await _persistSession(refreshed);
      return AuthState(session: refreshed);
    } on ApiException {
      await _clearSession();
      return const AuthState(session: null);
    }
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final response = await _repository.login(
        email: email,
        password: password,
      );
      final idToken = response.idToken;
      VerifiedToken? verified;
      if (idToken != null && idToken.isNotEmpty) {
        try {
          verified = await _repository.verifyToken(idToken);
        } on ApiException catch (error) {
          throw ApiException(
            message: error.message ?? 'Unable to verify login token',
            details: error.details,
          );
        }
      }

      final expiresAt = response.expiresInDuration != null
          ? DateTime.now().add(response.expiresInDuration!)
          : null;

      final session = AuthSession(
        uid: verified?.uid ?? response.localId ?? '',
        email: response.email ?? email,
        displayName: verified?.email ?? response.email,
        idToken: idToken,
        refreshToken: response.refreshToken,
        expiresAt: expiresAt,
        provider: AuthProvider.emailPassword,
      );

      await _persistSession(session);
      return AuthState(session: session);
    });
  }

  Future<void> signup({
    required String email,
    required String password,
    String? displayName,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _repository.signup(
        email: email,
        password: password,
        displayName: displayName,
      );
      // Automatically log the user in after signup.
      final response = await _repository.login(
        email: email,
        password: password,
      );
      final idToken = response.idToken;
      VerifiedToken? verified;
      if (idToken != null && idToken.isNotEmpty) {
        verified = await _repository.verifyToken(idToken);
      }

      final session = AuthSession(
        uid: verified?.uid ?? response.localId ?? '',
        email: response.email ?? email,
        displayName: displayName ?? verified?.email ?? response.email,
        idToken: idToken,
        refreshToken: response.refreshToken,
        expiresAt: response.expiresInDuration != null
            ? DateTime.now().add(response.expiresInDuration!)
            : null,
        provider: AuthProvider.emailPassword,
      );
      await _persistSession(session);
      return AuthState(session: session);
    });
  }

  Future<void> signInWithGoogle() async {
    final previous = state.value;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final account = await _googleSignIn.signIn();
      if (account == null) {
        return previous ?? const AuthState(session: null);
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        throw const ApiException(message: 'Failed to obtain Google ID token');
      }

      VerifiedToken? verified;
      try {
        verified = await _repository.verifyToken(idToken);
      } on ApiException catch (error) {
        // If verification fails, still allow the user to proceed with Google account
        // but warn through the exception so the UI can surface the error.
        throw ApiException(
          message: error.message ?? 'Google sign-in verification failed',
          details: error.details,
        );
      }

      final session = AuthSession(
        uid: verified.uid,
        email: verified.email ?? account.email,
        displayName: account.displayName ?? verified.email,
        idToken: idToken,
        provider: AuthProvider.google,
      );

      await _persistSession(session);
      return AuthState(session: session);
    });
  }

  Future<void> signOut() async {
    final previous = state.value;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await _clearSession();
      await _googleSignIn.signOut();
      return const AuthState(session: null);
    });

    if (state.hasError && previous != null) {
      state = AsyncData(previous);
    }
  }

  Future<void> _persistSession(AuthSession session) async {
    await _prefs.setString(_sessionStorageKey, session.serialize());
  }

  Future<void> _clearSession() async {
    await _prefs.remove(_sessionStorageKey);
  }
}
