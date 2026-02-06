import '../../../data/api_client.dart';
import '../../../data/api_exception.dart';
import 'auth_models.dart';

class AuthRepository {
  AuthRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<AuthLoginResponse> login({
    required String email,
    required String password,
  }) async {
    final result = await _apiClient.post(
      '/auth/login',
      body: {'email': email, 'password': password},
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected login response');
    }

    return AuthLoginResponse.fromJson(result);
  }

  Future<AuthSignupResponse> signup({
    required String email,
    required String password,
    String? displayName,
  }) async {
    final result = await _apiClient.post(
      '/auth/signup',
      body: {
        'email': email,
        'password': password,
        if (displayName != null && displayName.trim().isNotEmpty)
          'displayName': displayName,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected signup response');
    }

    return AuthSignupResponse.fromJson(result);
  }

  Future<VerifiedToken> verifyToken(String idToken) async {
    final result = await _apiClient.post(
      '/auth/verify-token',
      body: {'idToken': idToken},
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected verify token response');
    }

    return VerifiedToken.fromJson(result);
  }

  Future<void> forgotPassword({required String email}) async {
    final result = await _apiClient.post(
      '/auth/forgot-password',
      body: {'email': email},
    );
    if (result is! Map<String, dynamic> || result['success'] != true) {
      throw const ApiException(message: 'Failed to send password reset email');
    }
   }


}
