export interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}

export interface GoogleAuthResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  isNewUser: boolean;
  federatedId: string;
  profile: Record<string, any>;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (credentials: SignupCredentials) => Promise<User>;
  loginWithGoogle: (idToken?: string, accessToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  verifyToken: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  status: number;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: any;
}