import { apiFetch } from '../lib/backend';
import {
  AuthTokens,
  LoginCredentials,
  SignupCredentials,
  GoogleAuthResponse,
  User,
  ApiResponse
} from '@/types/auth';
import { ApiError } from '@/utils/apiUtils';

class AuthService {
  private static instance: AuthService;
  private tokenRefreshPromise: Promise<void> | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async signup(credentials: SignupCredentials): Promise<User> {
    try {
      const response = await apiFetch('/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          displayName: credentials.displayName,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }

      const userData = await response.json();
      return {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoUrl: userData.photoUrl,
        emailVerified: userData.emailVerified || false,
        createdAt: userData.createdAt || new Date().toISOString(),
        updatedAt: userData.updatedAt || new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during signup',
        status: 0,
      });
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }

      const tokenData = await response.json();
      return {
        idToken: tokenData.idToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: tokenData.expiresIn,
        localId: tokenData.localId,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during login',
        status: 0,
      });
    }
  }

  async loginWithGoogle(idToken?: string, accessToken?: string): Promise<AuthTokens & GoogleAuthResponse> {
    try {
      const response = await apiFetch('/auth/google-signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken,
          accessToken,
          requestUri: window.location.origin,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }

      const authData = await response.json();
      return {
        idToken: authData.idToken,
        refreshToken: authData.refreshToken,
        expiresIn: authData.expiresIn,
        localId: authData.localId,
        email: authData.email,
        displayName: authData.displayName,
        photoUrl: authData.photoUrl,
        isNewUser: authData.isNewUser,
        federatedId: authData.federatedId,
        profile: authData.profile,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during Google sign-in',
        status: 0,
      });
    }
  }

  async verifyToken(idToken: string): Promise<{ uid: string; email: string; claims: Record<string, any> }> {
    try {
      const response = await apiFetch('/auth/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during token verification',
        status: 0,
      });
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const response = await apiFetch('/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }

      const tokenData = await response.json();
      return {
        idToken: tokenData.idToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: tokenData.expiresIn,
        localId: tokenData.localId,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during token refresh',
        status: 0,
      });
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      const response = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      });

      if (!response.ok) {
        const error = await this.handleError(response);
        throw error;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: 'network_error',
        message: 'Network error occurred during password reset',
        status: 0,
      });
    }
  }

  async refreshTokenWithRetry(): Promise<void> {
    // Prevent multiple simultaneous refresh attempts
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.performTokenRefresh();
    return this.tokenRefreshPromise;
  }

  private async performTokenRefresh(): Promise<void> {
    try {
      const storedRefreshToken = this.getStoredRefreshToken();
      if (!storedRefreshToken) {
        throw new Error('No refresh token available');
      }

      const newTokens = await this.refreshToken(storedRefreshToken);
      this.storeTokens(newTokens);
      this.tokenRefreshPromise = null;
    } catch (error) {
      this.tokenRefreshPromise = null;
      throw error;
    }
  }

  private async handleError(response: Response): Promise<ApiError> {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: 'Unknown error occurred' };
    }

    return new ApiError({
      code: errorData.error || 'api_error',
      message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      status: response.status,
      details: errorData,
    });
  }

  // Token storage methods
  storeTokens(tokens: AuthTokens): void {
    try {
      localStorage.setItem('zen_auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.warn('Failed to store tokens:', error);
    }
  }

  getStoredTokens(): AuthTokens | null {
    try {
      const stored = localStorage.getItem('zen_auth_tokens');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to retrieve stored tokens:', error);
      return null;
    }
  }

  getStoredRefreshToken(): string | null {
    const tokens = this.getStoredTokens();
    return tokens?.refreshToken || null;
  }

  clearStoredTokens(): void {
    try {
      localStorage.removeItem('zen_auth_tokens');
    } catch (error) {
      console.warn('Failed to clear stored tokens:', error);
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp <= now + 300; // 5-minute buffer
    } catch {
      return true;
    }
  }

  async getValidToken(): Promise<string | null> {
    const tokens = this.getStoredTokens();
    if (!tokens?.idToken) {
      return null;
    }

    if (this.isTokenExpired(tokens.idToken)) {
      if (tokens.refreshToken) {
        try {
          await this.refreshTokenWithRetry();
          const newTokens = this.getStoredTokens();
          return newTokens?.idToken || null;
        } catch (error) {
          console.warn('Token refresh failed:', error);
          this.clearStoredTokens();
          return null;
        }
      } else {
        this.clearStoredTokens();
        return null;
      }
    }

    return tokens.idToken;
  }
}

export default AuthService.getInstance();