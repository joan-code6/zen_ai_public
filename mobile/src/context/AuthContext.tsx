import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../services/api';

// ─── types ───────────────────────────────────────────────────────────────────

interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
}

interface AuthState {
  user: AuthUser | null;
  idToken: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshIfNeeded: () => Promise<string | null>;
  /** Always returns a valid token, refreshes if expired */
  getToken: () => Promise<string>;
  updateProfile: (updates: { displayName?: string; photoUrl?: string }) => Promise<void>;
}

// ─── secure store keys ───────────────────────────────────────────────────────

const KEYS = {
  idToken: 'zen_id_token',
  refreshToken: 'zen_refresh_token',
  expiresAt: 'zen_expires_at',
  uid: 'zen_uid',
  email: 'zen_email',
  displayName: 'zen_display_name',
};

// ─── context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, idToken: null, loading: true });

  // ── bootstrap: check persisted session ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [idToken, expStr, uid, email, displayName, refreshToken] = await Promise.all([
          SecureStore.getItemAsync(KEYS.idToken),
          SecureStore.getItemAsync(KEYS.expiresAt),
          SecureStore.getItemAsync(KEYS.uid),
          SecureStore.getItemAsync(KEYS.email),
          SecureStore.getItemAsync(KEYS.displayName),
          SecureStore.getItemAsync(KEYS.refreshToken),
        ]);

        if (!idToken || !uid || !email) {
          setState({ user: null, idToken: null, loading: false });
          return;
        }

        const expiresAt = expStr ? parseInt(expStr, 10) : 0;
        const isExpired = Date.now() >= expiresAt - 60_000; // 1-min buffer

        if (isExpired && refreshToken) {
          // try refresh
          try {
            const refreshed = await auth.refreshToken(refreshToken);
            const newExpires = Date.now() + parseInt(refreshed.expiresIn, 10) * 1000;
            await Promise.all([
              SecureStore.setItemAsync(KEYS.idToken, refreshed.idToken),
              SecureStore.setItemAsync(KEYS.refreshToken, refreshed.refreshToken),
              SecureStore.setItemAsync(KEYS.expiresAt, String(newExpires)),
            ]);
            setState({
              user: { uid: refreshed.localId, email: refreshed.email, displayName: displayName ?? undefined },
              idToken: refreshed.idToken,
              loading: false,
            });
            return;
          } catch {
            // refresh failed → logged out
            await clearStore();
            setState({ user: null, idToken: null, loading: false });
            return;
          }
        }

        setState({
          user: { uid, email, displayName: displayName ?? undefined },
          idToken: isExpired ? null : idToken,
          loading: false,
        });
      } catch {
        setState({ user: null, idToken: null, loading: false });
      }
    })();
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────

  async function clearStore() {
    await Promise.all(Object.values(KEYS).map(k => SecureStore.deleteItemAsync(k)));
  }

  async function persistSession(data: {
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    localId: string;
    email: string;
    displayName?: string;
  }) {
    const expiresAt = Date.now() + parseInt(data.expiresIn, 10) * 1000;
    await Promise.all([
      SecureStore.setItemAsync(KEYS.idToken, data.idToken),
      SecureStore.setItemAsync(KEYS.refreshToken, data.refreshToken),
      SecureStore.setItemAsync(KEYS.expiresAt, String(expiresAt)),
      SecureStore.setItemAsync(KEYS.uid, data.localId),
      SecureStore.setItemAsync(KEYS.email, data.email),
      data.displayName
        ? SecureStore.setItemAsync(KEYS.displayName, data.displayName)
        : SecureStore.deleteItemAsync(KEYS.displayName),
    ]);
  }

  const updateProfile = useCallback(async (updates: { displayName?: string; photoUrl?: string }) => {
    // update secure store and in-memory user
    try {
      if (updates.displayName !== undefined) {
        await SecureStore.setItemAsync(KEYS.displayName, updates.displayName);
      }
      if (updates.photoUrl !== undefined) {
        await SecureStore.setItemAsync(KEYS.displayName + '_photo', updates.photoUrl);
      }
    } catch (e) {
      // ignore storage errors
    }

    setState(prev => ({
      ...prev,
      user: prev.user ? { ...prev.user, displayName: updates.displayName ?? prev.user.displayName, } : prev.user,
    }));
  }, []);

  // ── public API ───────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    const res = await auth.login(email, password);
    await persistSession(res);
    setState({
      user: { uid: res.localId, email: res.email, displayName: res.displayName },
      idToken: res.idToken,
      loading: false,
    });
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    // signup creates the user then logs them in
    await auth.signup(email, password, displayName);
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    await clearStore();
    setState({ user: null, idToken: null, loading: false });
  }, []);

  const refreshIfNeeded = useCallback(async (): Promise<string | null> => {
    const [expStr, refreshToken, currentToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.expiresAt),
      SecureStore.getItemAsync(KEYS.refreshToken),
      SecureStore.getItemAsync(KEYS.idToken),
    ]);

    const expiresAt = expStr ? parseInt(expStr, 10) : 0;
    const isExpired = Date.now() >= expiresAt - 60_000;

    if (!isExpired && currentToken) return currentToken;
    if (!refreshToken) return null;

    try {
      const refreshed = await auth.refreshToken(refreshToken);
      const newExpires = Date.now() + parseInt(refreshed.expiresIn, 10) * 1000;
      await Promise.all([
        SecureStore.setItemAsync(KEYS.idToken, refreshed.idToken),
        SecureStore.setItemAsync(KEYS.refreshToken, refreshed.refreshToken),
        SecureStore.setItemAsync(KEYS.expiresAt, String(newExpires)),
      ]);
      setState(prev => ({ ...prev, idToken: refreshed.idToken }));
      return refreshed.idToken;
    } catch {
      await clearStore();
      setState({ user: null, idToken: null, loading: false });
      return null;
    }
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const token = await refreshIfNeeded();
    if (!token) throw new Error('Not authenticated');
    return token;
  }, [refreshIfNeeded]);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, refreshIfNeeded, getToken, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
