import 'dart:convert';

enum AuthProvider { emailPassword, google }

class AuthSession {
  const AuthSession({
    required this.uid,
    required this.email,
    this.displayName,
    this.idToken,
    this.refreshToken,
    this.expiresAt,
    this.provider = AuthProvider.emailPassword,
  });

  final String uid;
  final String email;
  final String? displayName;
  final String? idToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  final AuthProvider provider;

  AuthSession copyWith({
    String? uid,
    String? email,
    String? displayName,
    String? idToken,
    String? refreshToken,
    DateTime? expiresAt,
    AuthProvider? provider,
  }) {
    return AuthSession(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      idToken: idToken ?? this.idToken,
      refreshToken: refreshToken ?? this.refreshToken,
      expiresAt: expiresAt ?? this.expiresAt,
      provider: provider ?? this.provider,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'uid': uid,
      'email': email,
      'displayName': displayName,
      'idToken': idToken,
      'refreshToken': refreshToken,
      'expiresAt': expiresAt?.toIso8601String(),
      'provider': provider.name,
    };
  }

  static AuthSession fromJson(Map<String, dynamic> json) {
    return AuthSession(
      uid: json['uid'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String?,
      idToken: json['idToken'] as String?,
      refreshToken: json['refreshToken'] as String?,
      expiresAt: json['expiresAt'] != null
          ? DateTime.tryParse(json['expiresAt'] as String)
          : null,
      provider: AuthProvider.values.firstWhere(
        (p) => p.name == json['provider'],
        orElse: () => AuthProvider.emailPassword,
      ),
    );
  }

  String serialize() => jsonEncode(toJson());

  static AuthSession? tryDeserialize(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      return AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }
}

class AuthLoginResponse {
  AuthLoginResponse.fromJson(Map<String, dynamic> json)
    : idToken = json['idToken'] as String?,
      refreshToken = json['refreshToken'] as String?,
      expiresIn = json['expiresIn'] as String?,
      localId = json['localId'] as String?,
      email = json['email'] as String?;

  final String? idToken;
  final String? refreshToken;
  final String? expiresIn;
  final String? localId;
  final String? email;

  Duration? get expiresInDuration {
    if (expiresIn == null) return null;
    return Duration(seconds: int.tryParse(expiresIn!) ?? 0);
  }
}

class AuthSignupResponse {
  AuthSignupResponse.fromJson(Map<String, dynamic> json)
    : uid = json['uid'] as String,
      email = json['email'] as String?,
      displayName = json['displayName'] as String?,
      emailVerified = json['emailVerified'] as bool? ?? false;

  final String uid;
  final String? email;
  final String? displayName;
  final bool emailVerified;
}

class VerifiedToken {
  VerifiedToken.fromJson(Map<String, dynamic> json)
    : uid = json['uid'] as String,
      email = json['email'] as String?,
      claims = (json['claims'] as Map<String, dynamic>?) ?? const {};

  final String uid;
  final String? email;
  final Map<String, dynamic> claims;
}
