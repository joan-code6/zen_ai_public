import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  ReactNode
} from 'react';
import AuthService from '@/services/authService';
import { AuthState, AuthContextType, LoginCredentials, SignupCredentials, User } from '@/types/auth';
import { ApiError } from '@/utils/apiUtils';

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; tokens: any } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'REFRESH_TOKENS'; payload: any }
  | { type: 'UPDATE_USER'; payload: Partial<User> };

const initialState: AuthState = {
  user: null,
  tokens: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        tokens: action.payload.tokens,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      };

    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        tokens: null,
        isLoading: false,
        isAuthenticated: false,
        error: action.payload,
      };

    case 'LOGOUT':
      return {
        ...state,
        user: null,
        tokens: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'REFRESH_TOKENS':
      return {
        ...state,
        tokens: action.payload,
      };

    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null,
      };

    default:
      return state;
  }
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize authentication state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        dispatch({ type: 'AUTH_START' });

        const tokens = AuthService.getStoredTokens();
        if (tokens?.idToken && !AuthService.isTokenExpired(tokens.idToken)) {
          try {
            const verified = await AuthService.verifyToken(tokens.idToken);
            
            // Try to get user profile (this would be a separate endpoint)
            // For now, construct user data from token
            const user: User = {
              uid: verified.uid,
              email: verified.email,
              displayName: 'User', // Would come from backend
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            dispatch({
              type: 'AUTH_SUCCESS',
              payload: { user, tokens },
            });
          } catch (error) {
            console.warn('Token verification failed:', error);
            AuthService.clearStoredTokens();
            dispatch({ type: 'AUTH_FAILURE', payload: 'Session expired' });
          }
        } else if (tokens?.refreshToken) {
          try {
            const newTokens = await AuthService.refreshToken(tokens.refreshToken);
            AuthService.storeTokens(newTokens);
            
            const verified = await AuthService.verifyToken(newTokens.idToken);
            const user: User = {
              uid: verified.uid,
              email: verified.email,
              displayName: 'User',
              emailVerified: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            dispatch({
              type: 'AUTH_SUCCESS',
              payload: { user, tokens: newTokens },
            });
          } catch (error) {
            console.warn('Token refresh failed:', error);
            AuthService.clearStoredTokens();
            dispatch({ type: 'AUTH_FAILURE', payload: 'Session expired' });
          }
        } else {
          dispatch({ type: 'LOGOUT' });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        dispatch({ type: 'AUTH_FAILURE', payload: 'Authentication failed' });
      }
    };

    initializeAuth();
  }, []);

  // Listen for token expiration events
  useEffect(() => {
    const handleTokenExpired = () => {
      dispatch({ type: 'LOGOUT' });
    };

    window.addEventListener('auth:token-expired', handleTokenExpired);
    return () => window.removeEventListener('auth:token-expired', handleTokenExpired);
  }, []);

  // Periodic token refresh
  useEffect(() => {
    if (!state.isAuthenticated || !state.tokens) {
      return;
    }

    const refreshInterval = setInterval(async () => {
      try {
        const isExpired = AuthService.isTokenExpired(state.tokens!.idToken);
        if (isExpired && state.tokens!.refreshToken) {
          const newTokens = await AuthService.refreshToken(state.tokens!.refreshToken);
          AuthService.storeTokens(newTokens);
          dispatch({ type: 'REFRESH_TOKENS', payload: newTokens });
        }
      } catch (error) {
        console.warn('Periodic token refresh failed:', error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(refreshInterval);
  }, [state.isAuthenticated]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const tokens = await AuthService.login(credentials);
      AuthService.storeTokens(tokens);
      
      const verified = await AuthService.verifyToken(tokens.idToken);
      
      // For now, create a basic user object
      // In a real implementation, we'd fetch full user profile
      const user: User = {
        uid: verified.uid,
        email: credentials.email,
        displayName: credentials.email.split('@')[0], // Temporary
        emailVerified: false, // Would come from backend
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, tokens },
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw error;
    }
  }, []);

  const signup = useCallback(async (credentials: SignupCredentials) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const user = await AuthService.signup(credentials);
      
      // After successful signup, automatically log in
      await login({ email: credentials.email, password: credentials.password });
      
      return user;
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Signup failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw error;
    }
  }, [login]);

  const loginWithGoogle = useCallback(async (idToken?: string, accessToken?: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const authData = await AuthService.loginWithGoogle(idToken, accessToken);
      const tokens = {
        idToken: authData.idToken,
        refreshToken: authData.refreshToken,
        expiresIn: authData.expiresIn,
      };
      
      AuthService.storeTokens(tokens);
      
      const user: User = {
        uid: authData.localId,
        email: authData.email,
        displayName: authData.displayName,
        photoUrl: authData.photoUrl,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user, tokens },
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Google sign-in failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      AuthService.clearStoredTokens();
      dispatch({ type: 'LOGOUT' });
    } catch (error) {
      console.error('Logout error:', error);
      // Still logout on client side even if server request fails
      dispatch({ type: 'LOGOUT' });
    }
  }, []);

  const refreshToken = useCallback(async () => {
    if (!state.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const newTokens = await AuthService.refreshToken(state.tokens.refreshToken);
      AuthService.storeTokens(newTokens);
      dispatch({ type: 'REFRESH_TOKENS', payload: newTokens });
    } catch (error) {
      dispatch({ type: 'LOGOUT' });
      throw error;
    }
  }, [state.tokens]);

  const verifyToken = useCallback(async (): Promise<boolean> => {
    if (!state.tokens?.idToken) {
      return false;
    }

    try {
      await AuthService.verifyToken(state.tokens.idToken);
      return true;
    } catch (error) {
      dispatch({ type: 'LOGOUT' });
      return false;
    }
  }, [state.tokens]);

  const resetPassword = useCallback(async (email: string) => {
    try {
      await AuthService.resetPassword(email);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Password reset failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    signup,
    loginWithGoogle,
    logout,
    refreshToken,
    verifyToken,
    resetPassword,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;