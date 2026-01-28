import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart' show sha256;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'package:universal_io/io.dart' as io;
import 'package:url_launcher/url_launcher.dart';

import '../models/auth.dart';
import '../models/chat.dart';
import '../models/note.dart';
import '../services/backend_service.dart';
import '../services/mcp_notes_client.dart';
import 'user_preferences.dart';
import '../i18n/i18n.dart';

const _kOAuthAuthorizeEndpoint = 'accounts.google.com';
const _kOAuthAuthorizePath = '/o/oauth2/v2/auth';
const _kOAuthTokenEndpoint = 'https://oauth2.googleapis.com/token';

const String _oauthSuccessPage = '''<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Google Sign-in Complete</title>
	<style>
		body { font-family: Roboto, Arial, sans-serif; margin: 0; padding: 32px; background: #f5f5f5; color: #202124; }
		main { max-width: 480px; margin: 80px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(60,64,67,.15); text-align: center; }
		h1 { font-size: 1.75rem; margin-bottom: 12px; }
		p { font-size: 1rem; line-height: 1.6; }
	</style>
</head>
<body>
	<main>
		<h1>You're signed in!</h1>
		<p>Close this Window and return to the app.</p>
		<script>setTimeout(() => window.close(), 1500);</script>
	</main>
</body>
</html>''';

String _oauthErrorPage(String? description) =>
    '''<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Google Sign-in Failed</title>
	<style>
		body { font-family: Roboto, Arial, sans-serif; margin: 0; padding: 32px; background: #fff3f3; color: #202124; }
		main { max-width: 480px; margin: 80px auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(217,48,37,.2); }
		h1 { font-size: 1.75rem; margin-bottom: 12px; color: #d93025; }
		p { font-size: 1rem; line-height: 1.6; }
	</style>
</head>
<body>
	<main>
		<h1>Sign-in was cancelled</h1>
		<p>${description ?? 'You can safely close this window.'}</p>
	</main>
</body>
</html>''';

const String _desktopGoogleClientId = String.fromEnvironment(
  'GOOGLE_OAUTH_CLIENT_ID',
  defaultValue: '1093494246167-dahun0rhtkfe2fec57jqdkpq7ep6s4p5.apps.googleusercontent.com',
);
const String _desktopGoogleClientSecret = String.fromEnvironment(
  'GOOGLE_OAUTH_CLIENT_SECRET',
  defaultValue: '',
);
const List<String> _googleOAuthScopes = <String>['openid', 'email', 'profile'];

class AppState extends ChangeNotifier {
  static const _pendingAssistantPrefix = 'pending-assistant-';
  AuthSession? _session;
  String? _displayName;
  String? _photoUrl;
  bool _isNewUser = false;
  bool _isRestoringSession = false;
  bool _isAuthenticating = false;
  bool _isSyncingChats = false;
  bool _isSendingMessage = false;
  bool _isUploadingFile = false;
  bool _isUpdatingProfile = false;
  bool _isLoadingFiles = false;
  final List<Chat> _chats = [];
  final Map<String, Chat> _chatCache = {};
  final Map<String, bool> _chatLoading = {};
  final List<Note> _notes = [];
  final Map<String, Note> _noteCache = {};
  bool _isSyncingNotes = false;
  final List<ChatFileListEntry> _ownedFiles = [];
  
  // Calendar State
  bool _isCalendarConnected = false;
  bool get isCalendarConnected => _isCalendarConnected;
  
  List<Map<String, dynamic>> _calendarEvents = [];
  List<Map<String, dynamic>> get calendarEvents => List.unmodifiable(_calendarEvents);
  
  bool _isLoadingCalendar = false;
  bool get isLoadingCalendar => _isLoadingCalendar;

  String? _lastError;
  String? _lastInfo;
  final McpNotesClient _notesMcpClient = McpNotesClient();
  String _notesMcpHost = UserPreferences.notesMcpHost;
  int _notesMcpPort = UserPreferences.notesMcpPort;
  bool _notesMcpAutoConnect = UserPreferences.notesMcpAutoConnect;
  bool _notesMcpConnecting = false;
  bool _notesMcpConnected = false;
  String? _notesMcpError;
  DateTime? _notesMcpLastConnected;
  List<McpToolDescription> _notesMcpTools = const [];
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: const ['email'],
    clientId: null,
  );

  AppState() {
    if (_notesMcpAutoConnect) {
      unawaited(connectNotesMcp(silent: true));
    }
  }

  AuthSession? get session => _session;
  String? get uid => _session?.uid;
  String? get email => _session?.email;
  String? get displayName => _displayName;
  String? get photoUrl => _photoUrl;
  bool get isNewUser => _isNewUser;
  bool get isAuthenticated => _session != null;
  bool get isAuthenticating => _isAuthenticating;
  bool get isSyncingChats => _isSyncingChats;
  bool get isSendingMessage => _isSendingMessage;
  bool get isUploadingFile => _isUploadingFile;
  bool get isRestoringSession => _isRestoringSession;
  bool get isUpdatingProfile => _isUpdatingProfile;
  bool get isLoadingFiles => _isLoadingFiles;
  UserProfile? get profile => _session?.profile;
  List<ChatFileListEntry> get ownedFiles => List.unmodifiable(_ownedFiles);

  List<Chat> get chats => List.unmodifiable(_chats);
  List<Note> get notes => List.unmodifiable(_notes);
  bool get isSyncingNotes => _isSyncingNotes;
  String get notesMcpHost => _notesMcpHost;
  int get notesMcpPort => _notesMcpPort;
  bool get notesMcpAutoConnect => _notesMcpAutoConnect;
  bool get isNotesMcpConnecting => _notesMcpConnecting;
  bool get isNotesMcpConnected => _notesMcpConnected;
  String? get notesMcpError => _notesMcpError;
  DateTime? get notesMcpLastConnected => _notesMcpLastConnected;
  List<McpToolDescription> get notesMcpTools => List.unmodifiable(_notesMcpTools);

  Chat? chatById(String? id) {
    if (id == null) return null;
    return _chatCache[id];
  }

  Note? noteById(String? id) {
    if (id == null) return null;
    return _noteCache[id];
  }

  bool isChatLoading(String chatId) => _chatLoading[chatId] ?? false;

  bool isTypingInChat(String chatId) {
    final chat = _chatCache[chatId];
    if (chat == null) {
      return false;
    }
    return chat.messages.any(
      (message) => message.id.startsWith(_pendingAssistantPrefix),
    );
  }

  String? consumeError() {
    final error = _lastError;
    _lastError = null;
    return error;
  }

  String? consumeInfo() {
    final info = _lastInfo;
    _lastInfo = null;
    return info;
  }

  void _setError(String message) {
    _lastError = message;
    notifyListeners();
  }

  void _setInfo(String message) {
    _lastInfo = message;
    notifyListeners();
  }

  Uri _resolveMcpUri(String host, int port) {
    final trimmed = host.trim();
    if (trimmed.isEmpty) {
      throw ArgumentError('Host cannot be empty');
    }

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
      final parsed = Uri.parse(trimmed);
      final path = parsed.path.isEmpty ? '/' : parsed.path;
      return parsed.replace(port: parsed.hasPort ? parsed.port : port, path: path);
    }

    if (trimmed.contains('://')) {
      final parsed = Uri.parse(trimmed);
      final effectivePort = parsed.hasPort ? parsed.port : port;
      final scheme = parsed.scheme.isEmpty
          ? (effectivePort == 443 ? 'wss' : 'ws')
          : parsed.scheme;
      final path = parsed.path.isEmpty ? '/' : parsed.path;
      return parsed.replace(scheme: scheme, port: effectivePort, path: path);
    }

    String hostOnly = trimmed;
    String path = '/';
    if (trimmed.contains('/')) {
      final slashIndex = trimmed.indexOf('/');
      hostOnly = trimmed.substring(0, slashIndex);
      path = trimmed.substring(slashIndex);
      if (path.isEmpty) {
        path = '/';
      }
    }

    var resolvedPort = port;
    if (hostOnly.contains(':')) {
      final parts = hostOnly.split(':');
      hostOnly = parts.first;
      final parsedPort = int.tryParse(parts.last);
      if (parsedPort != null) {
        resolvedPort = parsedPort;
      }
    }

    final scheme = resolvedPort == 443 ? 'wss' : 'ws';
    return Uri(scheme: scheme, host: hostOnly, port: resolvedPort, path: path);
  }

  Future<bool> connectNotesMcp({String? host, int? port, bool silent = false}) async {
    if (_notesMcpConnecting) {
      return _notesMcpConnected;
    }

    final resolvedHost = (host ?? _notesMcpHost).trim();
    final resolvedPort = port ?? _notesMcpPort;

    if (resolvedHost.isEmpty) {
      _notesMcpError = 'Provide a valid host name for the MCP server.';
      if (!silent) {
        _setError(_notesMcpError!);
      } else {
        notifyListeners();
      }
      return false;
    }

    _notesMcpConnecting = true;
    _notesMcpError = null;
    notifyListeners();

    try {
      final uri = _resolveMcpUri(resolvedHost, resolvedPort);
      await _notesMcpClient.connect(uri);
      _notesMcpHost = resolvedHost;
      _notesMcpPort = resolvedPort;
      await Future.wait([
        UserPreferences.setNotesMcpHost(_notesMcpHost),
        UserPreferences.setNotesMcpPort(_notesMcpPort),
      ]);
      final tools = await _notesMcpClient.listTools();
      _notesMcpTools = tools;
      _notesMcpConnected = true;
      _notesMcpLastConnected = DateTime.now();
      _notesMcpError = null;
      if (!silent) {
        _setInfo('Connected to notes MCP at ${uri.toString()}');
      }
      return true;
    } on McpClientException catch (e) {
      _notesMcpConnected = false;
      _notesMcpTools = const [];
      _notesMcpError = e.message;
      if (!silent) {
        _setError('Failed to connect to notes MCP: ${e.message}');
      }
      return false;
    } catch (e) {
      _notesMcpConnected = false;
      _notesMcpTools = const [];
      _notesMcpError = e.toString();
      if (!silent) {
        _setError('Failed to connect to notes MCP: $e');
      }
      return false;
    } finally {
      _notesMcpConnecting = false;
      notifyListeners();
    }
  }

  Future<void> disconnectNotesMcp() async {
    await _notesMcpClient.disconnect();
    if (_notesMcpConnected || _notesMcpConnecting) {
      _notesMcpConnected = false;
      _notesMcpConnecting = false;
      _notesMcpError = null;
      notifyListeners();
    }
  }

  Future<void> setNotesMcpAutoConnect(bool value) async {
    if (_notesMcpAutoConnect == value) return;
    _notesMcpAutoConnect = value;
    await UserPreferences.setNotesMcpAutoConnect(value);
    notifyListeners();
    if (value && !_notesMcpConnected) {
      unawaited(connectNotesMcp(silent: true));
    }
  }

  Future<void> refreshNotesMcpTools() async {
    if (!_notesMcpConnected) return;
    try {
      final tools = await _notesMcpClient.listTools();
      _notesMcpTools = tools;
      notifyListeners();
    } on McpClientException catch (e) {
      _notesMcpError = e.message;
      notifyListeners();
    } catch (e) {
      _notesMcpError = e.toString();
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> _callNotesTool(
    String name,
    Map<String, dynamic> arguments,
  ) async {
    if (!_notesMcpConnected) return null;
    try {
      final result = await _notesMcpClient.callTool(name, arguments);
      if (result is Map<String, dynamic>) {
        return result;
      }
      if (result is String && result.isNotEmpty) {
        final decoded = jsonDecode(result);
        if (decoded is Map<String, dynamic>) {
          return decoded;
        }
      }
    } on McpClientException catch (e) {
      _notesMcpError = e.message;
      if (e.message.contains('Disconnected')) {
        _notesMcpConnected = false;
      }
      notifyListeners();
    } catch (e) {
      _notesMcpError = e.toString();
      notifyListeners();
    }
    return null;
  }

  Note? _noteFromMcpResponse(Map<String, dynamic>? payload) {
    if (payload == null) return null;
    final noteJson = payload['note'];
    if (noteJson is Map<String, dynamic>) {
      return Note.fromJson(noteJson);
    }
    return null;
  }

  List<Note> _notesFromMcpItems(dynamic payload) {
    if (payload is List) {
      final notes = payload
          .whereType<Map<String, dynamic>>()
          .map(Note.fromJson)
          .toList();
      notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      return notes;
    }
    return const <Note>[];
  }

  void _applySession(AuthSession session) {
    _session = session;
    _displayName = session.displayName ?? session.profile?.displayName;
    _photoUrl = session.photoUrl;
    _isNewUser = session.isNewUser;
  }

  void _clearSession() {
    _session = null;
    _displayName = null;
    _photoUrl = null;
    _isNewUser = false;
    _isUpdatingProfile = false;
    _isLoadingFiles = false;
    _ownedFiles.clear();
    _notes.clear();
    _noteCache.clear();
    _isSyncingNotes = false;
  }

  Future<bool> _finalizeSession(
    AuthSession session, {
    String? fallbackDisplayName,
    bool fromGoogle = false,
  }) async {
    _applySession(session);
    await UserPreferences.setAuthSession(session);
    notifyListeners();

    if (session.profile == null ||
        _displayName == null ||
        _displayName!.isEmpty) {
      await refreshProfile(silent: true);
    }
    await Future.wait([
      fetchChats(),
      fetchNotes(),
    ]);
    final effectiveDisplayName =
        _displayName != null && _displayName!.isNotEmpty
        ? _displayName!
        : session.displayName;
    final resolvedName =
        effectiveDisplayName != null && effectiveDisplayName.isNotEmpty
        ? effectiveDisplayName
        : (fallbackDisplayName != null && fallbackDisplayName.isNotEmpty
              ? fallbackDisplayName
              : (session.email.isNotEmpty ? session.email : 'your account'));
    if (fromGoogle) {
      if (session.isNewUser) {
        _setInfo('Welcome $resolvedName! Your Google account is all set.');
      } else {
        _setInfo('Signed in with Google as $resolvedName.');
      }
    } else {
      _setInfo('Signed in as $resolvedName.');
    }
    unawaited(fetchChats());
    unawaited(fetchNotes());
    unawaited(refreshFiles());
    unawaited(checkCalendarConnection());
    return true;
  }

  Future<UserProfile?> refreshProfile({bool silent = false}) async {
    final currentSession = _session;
    if (currentSession == null) return null;
    if (!silent) {
      _isUpdatingProfile = true;
      notifyListeners();
    }

    try {
      final profile = await BackendService.fetchUserProfile(
        uid: currentSession.uid,
        session: currentSession,
      );
      final updatedSession = currentSession.copyWith(
        displayName: profile.displayName?.isNotEmpty == true
            ? profile.displayName
            : currentSession.displayName,
        profile: profile,
      );
      _applySession(updatedSession);
      await UserPreferences.setAuthSession(updatedSession);
      notifyListeners();
      return profile;
    } on BackendException catch (e) {
      if (!silent) {
        _setError(e.message);
      }
    } catch (e) {
      if (!silent) {
        _setError('Failed to refresh profile: $e');
      }
    } finally {
      if (!silent) {
        _isUpdatingProfile = false;
        notifyListeners();
      }
    }
    return null;
  }

  Future<bool> updateDisplayName(String newDisplayName) async {
    final currentSession = _session;
    if (currentSession == null) {
      _setError(translateForLocale('please_sign_in_update_display_name', UserPreferences.locale ?? 'en'));
      return false;
    }
    final trimmed = newDisplayName.trim();
    if (trimmed.isEmpty) {
      _setError(translateForLocale('display_name_cannot_be_empty', UserPreferences.locale ?? 'en'));
      return false;
    }
    _isUpdatingProfile = true;
    notifyListeners();
    try {
      final profile = await BackendService.updateDisplayName(
        uid: currentSession.uid,
        session: currentSession,
        displayName: trimmed,
      );
      final resolvedName = profile.displayName?.isNotEmpty == true
          ? profile.displayName!
          : trimmed;
      final updatedSession = currentSession.copyWith(
        displayName: resolvedName,
        profile: profile,
      );
      _applySession(updatedSession);
      await UserPreferences.setAuthSession(updatedSession);
      _setInfo(translateForLocale('display_name_updated', UserPreferences.locale ?? 'en', args: {'name': resolvedName}));
      return true;
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to update display name: $e');
    } finally {
      _isUpdatingProfile = false;
      notifyListeners();
    }
    return false;
  }

  Future<void> restoreSession() async {
    if (_isRestoringSession) return;
    _isRestoringSession = true;
    notifyListeners();

    try {
      final stored = UserPreferences.authSession;
      if (stored != null) {
        AuthSession validSession = stored;
        
        // If session is expired, try to refresh it using the refresh token
        if (stored.isExpired) {
          try {
            validSession = await BackendService.ensureValidToken(stored);
            // Update stored session with refreshed token
            await UserPreferences.setAuthSession(validSession);
          } on BackendException catch (e) {
            // Refresh failed, clear session
            _clearSession();
            await UserPreferences.clearAuthSession();
            _setError(e.message);
            return;
          } catch (e) {
            // Refresh failed, clear session
            _clearSession();
            await UserPreferences.clearAuthSession();
            _setError('Failed to restore session: $e');
            return;
          }
        }
        
        _applySession(validSession);
        notifyListeners();
        try {
          await BackendService.verifyToken(validSession.idToken);
          await refreshProfile(silent: true);
        } on BackendException catch (e) {
          _clearSession();
          await UserPreferences.clearAuthSession();
          _setError(e.message);
        }
      }
      if (_session != null) {
        await Future.wait([
          fetchChats(),
          fetchNotes(),
        ]);
        unawaited(checkCalendarConnection());
      }
    } finally {
      _isRestoringSession = false;
      notifyListeners();
    }
  }

  Future<bool> signup({
    required String email,
    required String password,
    required String displayName,
  }) async {
    final trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.isEmpty) {
      _setError(translateForLocale('display_name_required', UserPreferences.locale ?? 'en'));
      return false;
    }

    _isAuthenticating = true;
    notifyListeners();
    var success = false;
    try {
      await BackendService.signup(
        email: email,
        password: password,
        displayName: trimmedDisplayName,
      );
      _setInfo(translateForLocale('account_created_please_sign_in', UserPreferences.locale ?? 'en'));
      success = true;
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      if (e.toString().contains('Platform')) {
        _setError('Sign up is currently not supported on web. Please use the desktop or mobile app.');
      } else {
        _setError('Sign up failed: $e');
      }
    } finally {
      _isAuthenticating = false;
      notifyListeners();
    }
    return success;
  }

  Future<bool> login({
    required String email,
    required String password,
    String? fallbackDisplayName,
  }) async {
    final normalizedFallback = fallbackDisplayName?.trim();
    final effectiveFallback =
        normalizedFallback != null && normalizedFallback.isNotEmpty
            ? normalizedFallback
            : null;

    _isAuthenticating = true;
    notifyListeners();
    var success = false;
    try {
      final session = await BackendService.login(
        email: email,
        password: password,
      );
      success = await _finalizeSession(
        session,
        fallbackDisplayName: effectiveFallback,
      );
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError(translateForLocale('unable_to_sign_in', UserPreferences.locale ?? 'en', args: {'error': e.toString()}));
    } finally {
      _isAuthenticating = false;
      notifyListeners();
    }
    return success;
  }

  Future<bool> forgotPassword({required String email}) async {
    final trimmed = email.trim();
    if (trimmed.isEmpty) {
      _setError('Email is required');
      return false;
    }

    _isAuthenticating = true;
    notifyListeners();
    var success = false;
    try {
      final data = await BackendService.forgotPassword(email: trimmed);
      final message = data['message']?.toString() ?? 'Password reset email sent.';
      _setInfo(message);
      success = true;
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Unable to send password reset email: $e');
    } finally {
      _isAuthenticating = false;
      notifyListeners();
    }
    return success;
  }

  Future<bool> loginWithGoogle({String? requestUri}) async {
    if (_isAuthenticating) return false;
    _isAuthenticating = true;
    notifyListeners();
    try {
      if (!kIsWeb && (io.Platform.isWindows || io.Platform.isLinux)) {
        return await _loginWithGoogleDesktop(requestUri: requestUri);
      }
      return await _loginWithGooglePlugin(requestUri: requestUri);
    } finally {
      _isAuthenticating = false;
      notifyListeners();
    }
  }

  Future<bool> _loginWithGooglePlugin({String? requestUri}) async {
    try {
      GoogleSignInAccount? account;
      try {
        account = await _googleSignIn.signInSilently();
      } catch (_) {
        account = null;
      }
      account ??= await _googleSignIn.signIn();
      if (account == null) {
        _setInfo('Google sign-in was cancelled.');
        return false;
      }
      final authentication = await account.authentication;
      final idToken = authentication.idToken;
      final accessToken = authentication.accessToken;
      if ((idToken == null || idToken.isEmpty) &&
          (accessToken == null || accessToken.isEmpty)) {
        _setError('Google sign-in failed: missing credentials.');
        return false;
      }
      final resolvedRequestUri = requestUri != null && requestUri.isNotEmpty
          ? requestUri
          : (kIsWeb ? Uri.base.origin : null);
      final backendSession = await BackendService.googleSignIn(
        idToken: idToken,
        accessToken: idToken == null ? accessToken : null,
        requestUri: resolvedRequestUri,
      );
      final mergedSession = backendSession.copyWith(
        displayName: backendSession.displayName ?? account.displayName,
        photoUrl: backendSession.photoUrl ?? account.photoUrl,
      );
      return await _finalizeSession(
        mergedSession,
        fallbackDisplayName: account.displayName?.isNotEmpty == true
            ? account.displayName
            : account.email,
        fromGoogle: true,
      );
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Google sign-in failed: $e');
    }
    return false;
  }

  Future<bool> _loginWithGoogleDesktop({String? requestUri}) async {
    if (_desktopGoogleClientId.isEmpty) {
      _setError(
        'Google desktop sign-in requires configuring GOOGLE_OAUTH_CLIENT_ID via --dart-define.',
      );
      return false;
    }

    late final io.HttpServer server;
    try {
      server = await io.HttpServer.bind(io.InternetAddress.loopbackIPv4, 0);
    } catch (e) {
      _setError(
        'Google sign-in failed: unable to open a local callback server ($e).',
      );
      return false;
    }

    try {
      final redirectUri = Uri(
        scheme: 'http',
        host: 'localhost',
        port: server.port,
        path: '/',
      );
      final state = _generateVerifier(32);
      final codeVerifier = _generateVerifier(64);
      final codeChallenge = _computeCodeChallenge(codeVerifier);
      final authUri =
          Uri.https(_kOAuthAuthorizeEndpoint, _kOAuthAuthorizePath, {
            'response_type': 'code',
            'client_id': _desktopGoogleClientId,
            'redirect_uri': redirectUri.toString(),
            'scope': _googleOAuthScopes.join(' '),
            'state': state,
            'prompt': 'select_account consent',
            'access_type': 'offline',
            'code_challenge': codeChallenge,
            'code_challenge_method': 'S256',
          });

      final launched = await launchUrl(
        authUri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        _setError('Unable to open browser for Google sign-in.');
        return false;
      }

      final callback = await _waitForOAuthCallback(server, state).timeout(
        const Duration(minutes: 5),
        onTimeout: () => _OAuthCallbackResult.timeout(),
      );

      if (callback.timedOut) {
        _setError('Google sign-in timed out. Please try again.');
        return false;
      }
      if (callback.error != null) {
        if (callback.error == 'access_denied') {
          _setInfo('Google sign-in was cancelled.');
        } else {
          _setError(
            'Google sign-in failed: ${callback.errorDescription ?? callback.error}.',
          );
        }
        return false;
      }
      final authCode = callback.code;
      if (authCode == null || authCode.isEmpty) {
        _setError('Google sign-in failed: missing authorization code.');
        return false;
      }

      final tokenResponse = await http.post(
        Uri.parse(_kOAuthTokenEndpoint),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: {
          'code': authCode,
          'client_id': _desktopGoogleClientId,
          'redirect_uri': redirectUri.toString(),
          'grant_type': 'authorization_code',
          'code_verifier': codeVerifier,
          if (_desktopGoogleClientSecret.isNotEmpty)
            'client_secret': _desktopGoogleClientSecret,
        },
      );
      Map<String, dynamic>? tokenData;
      try {
        if (tokenResponse.body.isNotEmpty) {
          tokenData = json.decode(tokenResponse.body) as Map<String, dynamic>;
        }
      } catch (e) {
        tokenData = null;
      }
      if (tokenResponse.statusCode != 200 || tokenData == null) {
        final error = tokenData?['error']?.toString();
        final errorDescription = tokenData?['error_description']?.toString();
        final detail = [
          if (error != null && error.isNotEmpty) error,
          if (errorDescription != null && errorDescription.isNotEmpty)
            errorDescription,
        ].join(': ');
        var message =
            'Google sign-in failed: token exchange returned HTTP ${tokenResponse.statusCode}${detail.isEmpty ? '' : ' ($detail)'}.';
        if (_desktopGoogleClientSecret.isEmpty &&
            (errorDescription?.contains('client_secret') ?? false)) {
          message =
              'Google sign-in failed because Google expects a client secret. Either supply GOOGLE_OAUTH_CLIENT_SECRET via --dart-define or switch to a Desktop OAuth client (Installed app) that doesn\'t require a secret.';
        }
        debugPrint(
          '[oauth] token exchange failed -> status ${tokenResponse.statusCode}; body: ${tokenResponse.body}',
        );
        _setError(message);
        return false;
      }
      final idToken = tokenData['id_token'] as String?;
      final accessToken = (tokenData['access_token'] as String?) ?? '';
      if ((idToken == null || idToken.isEmpty) && accessToken.isEmpty) {
        _setError('Google sign-in failed: missing Google credentials.');
        return false;
      }
      try {
        final backendSession = await BackendService.googleSignIn(
          idToken: idToken,
          accessToken: idToken == null ? accessToken : null,
          requestUri: requestUri,
        );
        return await _finalizeSession(backendSession, fromGoogle: true);
      } on BackendException catch (e) {
        _setError(e.message);
      } catch (e) {
        _setError('Google sign-in failed: $e');
      }
      return false;
    } finally {
      await server.close(force: true);
    }
  }

  Future<void> logout() async {
    _clearSession();
    _chats.clear();
    _chatCache.clear();
    _chatLoading.clear();
    _notes.clear();
    _noteCache.clear();
    _isSyncingNotes = false;
    await UserPreferences.clearAuthSession();
    try {
      await _googleSignIn.signOut();
    } catch (_) {
      // ignore platform-specific sign out issues
    }
    notifyListeners();
  }

  Future<void> fetchNotes({bool silent = false}) async {
    final currentUid = uid;
    if (currentUid == null) return;

    final shouldNotifyProgress = !silent;
    if (shouldNotifyProgress) {
      _isSyncingNotes = true;
      notifyListeners();
    }

    try {
      final fetched = await BackendService.listNotes(currentUid);
      _notes
        ..clear()
        ..addAll(fetched);
      _noteCache
        ..clear();
      for (final note in fetched) {
        _noteCache[note.id] = note;
      }
    } on BackendException catch (e) {
      if (!silent) {
        _setError(e.message);
      }
    } catch (e) {
      if (!silent) {
        _setError('Failed to load notes: $e');
      }
    } finally {
      if (shouldNotifyProgress) {
        _isSyncingNotes = false;
      }
      notifyListeners();
    }
  }

  Future<Note?> createNote({
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
  }) async {
    final currentUid = uid;
    if (currentUid == null) {
      _setError(translateForLocale('please_sign_in_create_notes', UserPreferences.locale ?? 'en'));
      return null;
    }

    try {
      Note? note;
      if (_notesMcpConnected) {
        final response = await _callNotesTool('notes.create', {
          'uid': currentUid,
          if (title != null && title.isNotEmpty) 'title': title,
          if (content != null && content.isNotEmpty) 'content': content,
          if (keywords != null && keywords.isNotEmpty) 'keywords': keywords,
          if (triggerWords != null && triggerWords.isNotEmpty)
            'trigger_words': triggerWords,
        });
        note = _noteFromMcpResponse(response);
      }

      note ??= await BackendService.createNote(
        uid: currentUid,
        title: title,
        content: content,
        keywords: keywords,
        triggerWords: triggerWords,
      );
      _upsertNote(note);
      notifyListeners();
      return note;
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to create note: $e');
    }
    return null;
  }

  Future<Note?> updateNote({
    required String noteId,
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
  }) async {
    final currentUid = uid;
    if (currentUid == null) {
      _setError(translateForLocale('please_sign_in_update_notes', UserPreferences.locale ?? 'en'));
      return null;
    }

    try {
      Note? note;
      if (_notesMcpConnected) {
        final response = await _callNotesTool('notes.update', {
          'uid': currentUid,
          'note_id': noteId,
          if (title != null) 'title': title,
          if (content != null) 'content': content,
          if (keywords != null) 'keywords': keywords,
          if (triggerWords != null) 'trigger_words': triggerWords,
        });
        note = _noteFromMcpResponse(response);
      }

      note ??= await BackendService.updateNote(
        noteId: noteId,
        uid: currentUid,
        title: title,
        content: content,
        keywords: keywords,
        triggerWords: triggerWords,
      );
      _upsertNote(note);
      notifyListeners();
      return note;
    } on BackendException catch (e) {
      _setError(e.message);
    } on ArgumentError catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to update note: $e');
    }
    return null;
  }

  Future<bool> deleteNote(String noteId) async {
    final currentUid = uid;
    if (currentUid == null) {
      _setError(translateForLocale('please_sign_in_delete_notes', UserPreferences.locale ?? 'en'));
      return false;
    }

    try {
      var deleted = false;
      if (_notesMcpConnected) {
        final response = await _callNotesTool('notes.delete', {
          'uid': currentUid,
          'note_id': noteId,
        });
        deleted = response?['deleted'] == true;
      }

      if (!deleted) {
        await BackendService.deleteNote(noteId: noteId, uid: currentUid);
      }
      _notes.removeWhere((note) => note.id == noteId);
      _noteCache.remove(noteId);
      notifyListeners();
      return true;
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to delete note: $e');
    }
    return false;
  }

  Future<List<Note>> searchNotes({
    String? query,
    List<String>? keywords,
    List<String>? triggerWords,
    int? limit,
  }) async {
    final currentUid = uid;
    if (currentUid == null) {
      _setError(translateForLocale('please_sign_in_search_notes', UserPreferences.locale ?? 'en'));
      return const <Note>[];
    }

    try {
      if (_notesMcpConnected) {
        final response = await _callNotesTool('notes.search', {
          'uid': currentUid,
          if (query != null && query.trim().isNotEmpty) 'query': query.trim(),
          if (keywords != null && keywords.isNotEmpty)
            'keyword_terms': keywords,
          if (triggerWords != null && triggerWords.isNotEmpty)
            'trigger_terms': triggerWords,
          if (limit != null && limit > 0) 'limit': limit,
        });
        if (response != null) {
          return _notesFromMcpItems(response['items']);
        }
      }

      return await BackendService.searchNotes(
        uid: currentUid,
        query: query,
        keywords: keywords,
        triggerWords: triggerWords,
        limit: limit,
      );
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to search notes: $e');
    }
    return const <Note>[];
  }

  void _upsertNote(Note note) {
    _noteCache[note.id] = note;
    final existingIndex = _notes.indexWhere((element) => element.id == note.id);
    if (existingIndex >= 0) {
      _notes[existingIndex] = note;
    } else {
      _notes.add(note);
    }
    _notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  }

  bool _applyNotesActionResult(Map<String, dynamic> payload) {
    final actionName = payload['action']?.toString();
    if (actionName == null || actionName.isEmpty) {
      return false;
    }

    final normalizedAction = actionName.toLowerCase();
    final status = payload['status']?.toString().toLowerCase();
    if (status != null && status.isNotEmpty && status != 'success') {
      final error = payload['error']?.toString();
      if (error != null && error.isNotEmpty) {
        _setError('Notes action failed: $error');
      }
      return false;
    }

    switch (normalizedAction) {
      case 'create':
        final noteJson = payload['note'];
        if (noteJson is Map<String, dynamic>) {
          final note = Note.fromJson(noteJson);
          _upsertNote(note);
          final title = note.title.trim();
          if (title.isNotEmpty) {
            _setInfo('Created note "$title".');
          } else {
            _setInfo('Created a new note.');
          }
          return true;
        }
        break;
      case 'update':
        final noteJson = payload['note'];
        if (noteJson is Map<String, dynamic>) {
          final note = Note.fromJson(noteJson);
          _upsertNote(note);
          final title = note.title.trim();
          if (title.isNotEmpty) {
            _setInfo('Updated note "$title".');
          } else {
            _setInfo('Updated note.');
          }
          return true;
        }
        break;
      case 'delete':
        final noteId = payload['note_id']?.toString() ?? payload['id']?.toString();
        if (noteId != null && noteId.isNotEmpty) {
          _notes.removeWhere((note) => note.id == noteId);
          _noteCache.remove(noteId);
          _setInfo('Deleted note.');
          return true;
        }
        break;
      case 'search':
        final items = payload['results'];
        final count = items is List ? items.length : 0;
        final message = count == 1 ? 'Found 1 matching note.' : 'Found $count matching notes.';
        _setInfo(message);
        break;
      default:
        break;
    }

    return false;
  }

  Future<void> fetchChats() async {
    final currentUid = uid;
    if (currentUid == null) return;

    _isSyncingChats = true;
    notifyListeners();
    try {
      final fetched = await BackendService.listChats(currentUid);
      final fetchedIds = fetched.map((chat) => chat.id).toSet();
      _chatCache.removeWhere((key, value) => !fetchedIds.contains(key));
      _ownedFiles.removeWhere((entry) => !fetchedIds.contains(entry.chat.id));
      final merged = <Chat>[];
      for (final chat in fetched) {
        final existing = _chatCache[chat.id];
        if (existing != null) {
          final preservedMessages = existing.messages.isNotEmpty
              ? List<ChatMessage>.from(existing.messages)
              : <ChatMessage>[];
          final preservedFiles = existing.files.isNotEmpty
              ? List<ChatFile>.from(existing.files)
              : <ChatFile>[];
          final mergedChat = chat.copyWith(
            messages: preservedMessages,
            files: preservedFiles,
          );
          _chatCache[chat.id] = mergedChat;
          merged.add(mergedChat);
        } else {
          _chatCache[chat.id] = chat;
          merged.add(chat);
        }
      }
      _chats
        ..clear()
        ..addAll(merged);
      await fetchOwnedFiles(silent: true);
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to load chats: $e');
    } finally {
      _isSyncingChats = false;
      notifyListeners();
    }
  }

  Future<List<ChatFileListEntry>> fetchOwnedFiles({bool silent = false}) async {
    final currentSession = _session;
    if (currentSession == null) {
      if (!silent) {
        _setError(translateForLocale('please_sign_in_view_files', UserPreferences.locale ?? 'en'));
      }
      return List.unmodifiable(_ownedFiles);
    }

    if (!silent) {
      _isLoadingFiles = true;
      notifyListeners();
    }

    try {
      final items = await BackendService.listUserFiles(
        session: currentSession,
      );
      _ownedFiles
        ..clear()
        ..addAll(items)
        ..sort((a, b) => b.file.createdAt.compareTo(a.file.createdAt));
      return List.unmodifiable(_ownedFiles);
    } on BackendException catch (e) {
      if (!silent) {
        _setError(e.message);
      }
    } catch (e) {
      if (!silent) {
        _setError('Failed to load files: $e');
      }
    } finally {
      if (!silent) {
        _isLoadingFiles = false;
      }
      notifyListeners();
    }
    return List.unmodifiable(_ownedFiles);
  }

  Future<void> refreshFiles() async {
    final currentSession = _session;
    if (currentSession == null) return;

    _isLoadingFiles = true;
    notifyListeners();
    try {
      final items = await BackendService.listUserFiles(
        session: currentSession,
      );
      _ownedFiles
        ..clear()
        ..addAll(items)
        ..sort((a, b) => b.file.createdAt.compareTo(a.file.createdAt));
    } on BackendException catch (e) {
      _setError(e.message);
    } catch (e) {
      _setError('Failed to load files: $e');
    } finally {
      _isLoadingFiles = false;
      notifyListeners();
    }
  }

  Future<void> checkCalendarConnection() async {
    if (_session == null) return;
    try {
      final result = await BackendService.getCalendarConnection(session: _session!);
      _isCalendarConnected = result['connected'] == true;
      notifyListeners();
      if (_isCalendarConnected) {
        await fetchCalendarEvents();
      }
    } catch (e) {
      debugPrint('Error checking calendar connection: $e');
    }
  }

  Future<void> connectCalendar() async {
    if (_session == null) return;
    _isLoadingCalendar = true;
    notifyListeners();

    io.HttpServer? server;
    try {
      server = await io.HttpServer.bind(io.InternetAddress.loopbackIPv4, 0);
      final redirectUri = 'http://localhost:${server.port}/';
      
      final state = _generateVerifier(32);
      final codeVerifier = _generateVerifier(64);
      final codeChallenge = _computeCodeChallenge(codeVerifier);

      final authInfo = await BackendService.getCalendarAuthUrl(
        redirectUri: redirectUri,
        state: state,
        codeChallenge: codeChallenge,
        codeChallengeMethod: 'S256',
        accessType: 'offline',
      );

      final authUrl = authInfo['authorizationUrl'];
      if (authUrl == null) throw Exception('No authorization URL returned');

      final launched = await launchUrl(
        Uri.parse(authUrl),
        mode: LaunchMode.externalApplication,
      );
      
      if (!launched) {
        throw Exception('Unable to open browser for Calendar connection.');
      }

      final callback = await _waitForOAuthCallback(server, state).timeout(
        const Duration(minutes: 5),
        onTimeout: () => _OAuthCallbackResult.timeout(),
      );

      if (callback.timedOut) {
        throw Exception('Calendar connection timed out.');
      }
      if (callback.error != null) {
        throw Exception('Calendar connection failed: ${callback.errorDescription ?? callback.error}');
      }
      
      final authCode = callback.code;
      if (authCode == null || authCode.isEmpty) {
        throw Exception('No authorization code received.');
      }

      await BackendService.exchangeCalendarCode(
        code: authCode,
        redirectUri: redirectUri,
        session: _session!,
        codeVerifier: codeVerifier,
      );

      _isCalendarConnected = true;
      await fetchCalendarEvents();
      _setInfo('Calendar connected successfully!');

    } catch (e) {
      _setError('Failed to connect calendar: $e');
    } finally {
      await server?.close(force: true);
      _isLoadingCalendar = false;
      notifyListeners();
    }
  }

  Future<void> disconnectCalendar() async {
    try {
      await BackendService.deleteCalendarConnection(session: _session!);
      _isCalendarConnected = false;
      _calendarEvents = [];
      notifyListeners();
    } catch (e) {
      _setError('Failed to disconnect calendar: $e');
    }
  }

  Future<void> fetchCalendarEvents() async {
    if (!_isCalendarConnected) return;
    _isLoadingCalendar = true;
    notifyListeners();
    try {
      // Fetch events without time filters for now
      final result = await BackendService.getCalendarEvents(
        session: _session!,
        maxResults: 250,
      );
      
      debugPrint('Calendar events result: $result');
      
      if (result['items'] is List) {
        _calendarEvents = List<Map<String, dynamic>>.from(result['items']);
        debugPrint('Fetched ${_calendarEvents.length} events');
      }
    } catch (e) {
      debugPrint('Error fetching events: $e');
    } finally {
      _isLoadingCalendar = false;
      notifyListeners();
    }
  }

  Future<Chat?> createChat({required String title}) async {
    final currentUid = uid;
    if (currentUid == null) return null;
    try {
      final chat = await BackendService.createChat(uid: currentUid, title: title);
      _chatCache[chat.id] = chat;
      _chats.insert(0, chat);
      notifyListeners();
      return chat;
    } catch (e) {
      _setError('Failed to create chat: $e');
      return null;
    }
  }

  Future<void> sendMessage({
    required String chatId,
    String? content,
    List<String> fileIds = const [],
  }) async {
    final currentUid = uid;
    if (currentUid == null) return;
    
    _isSendingMessage = true;
    notifyListeners();
    
    try {
      // Optimistic update
      final chat = _chatCache[chatId];
      if (chat != null) {
        final userMsg = ChatMessage(
          id: 'pending-${DateTime.now().millisecondsSinceEpoch}',
          role: 'user',
          content: content ?? '',
          createdAt: DateTime.now(),
          fileIds: fileIds,
        );
        final updatedChat = chat.copyWith(
          messages: [...chat.messages, userMsg],
          updatedAt: DateTime.now(),
        );
        _chatCache[chatId] = updatedChat;
        final index = _chats.indexWhere((c) => c.id == chatId);
        if (index >= 0) {
          _chats[index] = updatedChat;
          _chats.removeAt(index);
          _chats.insert(0, updatedChat);
        }
        notifyListeners();
      }

      await BackendService.sendMessage(
        uid: currentUid,
        chatId: chatId,
        content: content ?? '',
        fileIds: fileIds,
      );
      
      // Update with real message
      await ensureChatLoaded(chatId);
      
    } catch (e) {
      _setError('Failed to send message: $e');
    } finally {
      _isSendingMessage = false;
      notifyListeners();
    }
  }

  Future<ChatFile?> uploadChatFile({
    required String chatId,
    required String fileName,
    required List<int> bytes,
    required String mimeType,
  }) async {
    final currentUid = uid;
    final currentSession = _session;
    if (currentUid == null || currentSession == null) return null;
    
    _isUploadingFile = true;
    notifyListeners();
    
    try {
      final file = await BackendService.uploadChatFile(
        uid: currentUid,
        session: currentSession,
        chatId: chatId,
        fileName: fileName,
        bytes: bytes,
        mimeType: mimeType,
      );
      return file;
    } catch (e) {
      _setError('Failed to upload file: $e');
      return null;
    } finally {
      _isUploadingFile = false;
      notifyListeners();
    }
  }

  Future<void> ensureChatLoaded(String chatId) async {
    final currentUid = uid;
    if (currentUid == null) return;
    
    _chatLoading[chatId] = true;
    notifyListeners();
    
    try {
      final chat = await BackendService.getChat(uid: currentUid, chatId: chatId);
      _chatCache[chatId] = chat;
      final index = _chats.indexWhere((c) => c.id == chatId);
      if (index >= 0) {
        _chats[index] = chat;
      } else {
        _chats.insert(0, chat);
      }
    } catch (e) {
      debugPrint('Failed to load chat $chatId: $e');
    } finally {
      _chatLoading[chatId] = false;
      notifyListeners();
    }
  }

  Future<void> updateChat({required String chatId, required String title}) async {
    final currentUid = uid;
    if (currentUid == null) return;
    try {
      await BackendService.updateChat(uid: currentUid, chatId: chatId, title: title);
      final chat = _chatCache[chatId];
      if (chat != null) {
        final updated = chat.copyWith(title: title);
        _chatCache[chatId] = updated;
        final index = _chats.indexWhere((c) => c.id == chatId);
        if (index >= 0) {
          _chats[index] = updated;
        }
        notifyListeners();
      }
    } catch (e) {
      _setError('Failed to rename chat: $e');
    }
  }

  Future<void> deleteChat(String chatId) async {
    final currentUid = uid;
    if (currentUid == null) return;
    try {
      await BackendService.deleteChat(uid: currentUid, chatId: chatId);
      _chatCache.remove(chatId);
      _chats.removeWhere((c) => c.id == chatId);
      notifyListeners();
    } catch (e) {
      _setError('Failed to delete chat: $e');
    }
  }

  Future<void> createEvent(Map<String, dynamic> event) async {
    if (_session == null) return;
    try {
      await BackendService.createCalendarEvent(
        session: _session!,
        event: event,
      );
      await fetchCalendarEvents();
      _setInfo('Event created successfully.');
    } catch (e) {
      _setError('Failed to create event: $e');
    }
  }

  Future<void> updateEvent(String eventId, Map<String, dynamic> event) async {
    if (_session == null) return;
    try {
      await BackendService.updateCalendarEvent(
        session: _session!,
        eventId: eventId,
        event: event,
      );
      await fetchCalendarEvents();
      _setInfo('Event updated successfully.');
    } catch (e) {
      _setError('Failed to update event: $e');
    }
  }

  Future<void> deleteEvent(String eventId) async {
    if (_session == null) return;
    try {
      await BackendService.deleteCalendarEvent(
        eventId,
        session: _session!,
      );
      await fetchCalendarEvents();
      _setInfo('Event deleted successfully.');
    } catch (e) {
      _setError('Failed to delete event: $e');
    }
  }
}

const String _pkceCharset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

String _generateVerifier(int length) {
  final random = _newSecureRandom();
  final buffer = StringBuffer();
  for (var i = 0; i < length; i++) {
    buffer.write(_pkceCharset[random.nextInt(_pkceCharset.length)]);
  }
  return buffer.toString();
}

Random _newSecureRandom() {
  try {
    return Random.secure();
  } catch (_) {
    return Random();
  }
}

String _computeCodeChallenge(String verifier) {
  final digest = sha256.convert(utf8.encode(verifier));
  return base64UrlEncode(digest.bytes).replaceAll('=', '');
}

Future<_OAuthCallbackResult> _waitForOAuthCallback(
  io.HttpServer server,
  String expectedState,
) async {
  await for (final request in server) {
    if (request.uri.path == '/favicon.ico') {
      request.response.statusCode = io.HttpStatus.noContent;
      await request.response.close();
      continue;
    }
    if (request.method != 'GET') {
      await _respondPlain(
        request.response,
        io.HttpStatus.methodNotAllowed,
        'Only GET is supported.',
      );
      continue;
    }
    final params = request.uri.queryParameters;
    if (!params.containsKey('state') || params['state'] != expectedState) {
      await _respondPlain(
        request.response,
        io.HttpStatus.badRequest,
        'State validation failed.',
      );
      continue;
    }
    final error = params['error'];
    if (error != null) {
      final description = params['error_description'];
      await _respondHtml(
        request.response,
        _oauthErrorPage(description),
        statusCode: io.HttpStatus.ok,
      );
      return _OAuthCallbackResult(error: error, errorDescription: description);
    }
    final code = params['code'];
    if (code != null && code.isNotEmpty) {
      await _respondHtml(
        request.response,
        _oauthSuccessPage,
        statusCode: io.HttpStatus.ok,
      );
      return _OAuthCallbackResult(code: code);
    }
    await _respondPlain(
      request.response,
      io.HttpStatus.badRequest,
      'Missing authorization code.',
    );
  }
  return _OAuthCallbackResult(
    error: 'loopback_server_closed',
    errorDescription:
        'Callback server closed before receiving authorization response.',
  );
}

Future<void> _respondHtml(
  io.HttpResponse response,
  String body, {
  int statusCode = io.HttpStatus.ok,
}) async {
  response.statusCode = statusCode;
  response.headers.set(
    io.HttpHeaders.contentTypeHeader,
    'text/html; charset=utf-8',
  );
  response.headers.set('Cache-Control', 'no-store');
  response.write(body);
  await response.close();
}

Future<void> _respondPlain(
  io.HttpResponse response,
  int statusCode,
  String message,
) async {
  response.statusCode = statusCode;
  response.headers.set(
    io.HttpHeaders.contentTypeHeader,
    'text/plain; charset=utf-8',
  );
  response.headers.set('Cache-Control', 'no-store');
  response.write(message);
  await response.close();
}

class _OAuthCallbackResult {
  final String? code;
  final String? error;
  final String? errorDescription;
  final bool timedOut;

  const _OAuthCallbackResult({
    this.code,
    this.error,
    this.errorDescription,
    this.timedOut = false,
  });

  factory _OAuthCallbackResult.timeout() =>
      const _OAuthCallbackResult(timedOut: true);
}
