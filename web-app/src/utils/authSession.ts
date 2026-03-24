import { User } from '@/types/auth';

const LOGGED_IN_COOKIE = 'logged_in';
const LAST_USER_KEY = 'zen_last_user';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setLoggedInCookie(value: boolean): void {
  if (value) {
    document.cookie = `${LOGGED_IN_COOKIE}=true; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
    return;
  }

  document.cookie = `${LOGGED_IN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function hasLoggedInCookie(): boolean {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${LOGGED_IN_COOKIE}=true`);
}

export function persistLastUser(user: User | null): void {
  if (!user) {
    localStorage.removeItem(LAST_USER_KEY);
    return;
  }

  localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
}

export function getPersistedLastUser(): User | null {
  const raw = localStorage.getItem(LAST_USER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.uid || !parsed?.email) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
