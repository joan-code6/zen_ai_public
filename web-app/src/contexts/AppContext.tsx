import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
  useEffect
} from 'react';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { setUserLanguage } from '@/i18n';
import SettingsService, { UserSettings } from '@/services/settingsService';

// Types
export interface AppState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  isOnline: boolean;
  currentView: 'chat' | 'email' | 'calendar';
  loading: {
    global: boolean;
    chat: boolean;
    email: boolean;
    calendar: boolean;
  };
  notifications: {
    email: number;
    calendar: number;
  };
  settings: UserSettings | null;
}

type AppAction =
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'SET_CURRENT_VIEW'; payload: 'chat' | 'email' | 'calendar' }
  | { type: 'SET_GLOBAL_LOADING'; payload: boolean }
  | { type: 'SET_CHAT_LOADING'; payload: boolean }
  | { type: 'SET_EMAIL_LOADING'; payload: boolean }
  | { type: 'SET_CALENDAR_LOADING'; payload: boolean }
  | { type: 'INCREMENT_EMAIL_NOTIFICATIONS' }
  | { type: 'INCREMENT_CALENDAR_NOTIFICATIONS' }
  | { type: 'CLEAR_EMAIL_NOTIFICATIONS' }
  | { type: 'CLEAR_CALENDAR_NOTIFICATIONS' }
  | { type: 'SET_SETTINGS'; payload: UserSettings };

const initialState: AppState = {
  theme: 'light',
  sidebarOpen: true,
  isOnline: navigator.onLine,
  currentView: 'chat',
  loading: {
    global: false,
    chat: false,
    email: false,
    calendar: false,
  },
  notifications: {
    email: 0,
    calendar: 0,
  },
  settings: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
      };

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        sidebarOpen: !state.sidebarOpen,
      };

    case 'SET_SIDEBAR_OPEN':
      return {
        ...state,
        sidebarOpen: action.payload,
      };

    case 'SET_ONLINE_STATUS':
      return {
        ...state,
        isOnline: action.payload,
      };

    case 'SET_CURRENT_VIEW':
      return {
        ...state,
        currentView: action.payload,
      };

    case 'SET_GLOBAL_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          global: action.payload,
        },
      };

    case 'SET_CHAT_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          chat: action.payload,
        },
      };

    case 'SET_EMAIL_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          email: action.payload,
        },
      };

    case 'SET_CALENDAR_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          calendar: action.payload,
        },
      };

    case 'INCREMENT_EMAIL_NOTIFICATIONS':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          email: state.notifications.email + 1,
        },
      };

    case 'INCREMENT_CALENDAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          calendar: state.notifications.calendar + 1,
        },
      };

    case 'CLEAR_EMAIL_NOTIFICATIONS':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          email: 0,
        },
      };

    case 'CLEAR_CALENDAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: {
          ...state.notifications,
          calendar: 0,
        },
      };

    case 'SET_SETTINGS':
      return {
        ...state,
        settings: action.payload,
      };

    default:
      return state;
  }
}

interface AppProviderProps {
  children: ReactNode;
}

const AppContext = createContext<{
  state: AppState;
  actions: {
    addToast: (message: string, variant?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
    setTheme: (theme: 'light' | 'dark') => void;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    setCurrentView: (view: 'chat' | 'email' | 'calendar') => void;
    setGlobalLoading: (loading: boolean) => void;
    setChatLoading: (loading: boolean) => void;
    setEmailLoading: (loading: boolean) => void;
    setCalendarLoading: (loading: boolean) => void;
    incrementEmailNotifications: () => void;
    incrementCalendarNotifications: () => void;
    clearEmailNotifications: () => void;
    clearCalendarNotifications: () => void;
  };
} | undefined>(undefined);

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { isAuthenticated, user } = useAuth();
  const { theme, setTheme: setNextTheme } = useTheme();

  // Sync theme state with next-themes
  useEffect(() => {
    if (theme && theme !== state.theme) {
      dispatch({ type: 'SET_THEME', payload: theme as 'light' | 'dark' });
    }
  }, [theme, state.theme]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Clear notifications when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'CLEAR_EMAIL_NOTIFICATIONS' });
      dispatch({ type: 'CLEAR_CALENDAR_NOTIFICATIONS' });
    }
  }, [isAuthenticated]);

  const actions = {
    addToast: useCallback((message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info', duration?: number) => {
      switch (variant) {
        case 'success':
          toast.success(message, { duration });
          break;
        case 'error':
          toast.error(message, { duration });
          break;
        case 'warning':
          toast.warning(message, { duration });
          break;
        case 'info':
        default:
          toast(message, { duration });
          break;
      }
    }, []),

    setTheme: useCallback((theme: 'light' | 'dark') => {
      setNextTheme(theme);
      dispatch({ type: 'SET_THEME', payload: theme });
    }, [setNextTheme]),

    toggleSidebar: useCallback(() => {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    }, []),

    setSidebarOpen: useCallback((open: boolean) => {
      dispatch({ type: 'SET_SIDEBAR_OPEN', payload: open });
    }, []),

    setCurrentView: useCallback((view: 'chat' | 'email' | 'calendar') => {
      dispatch({ type: 'SET_CURRENT_VIEW', payload: view });
    }, []),

    setGlobalLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_GLOBAL_LOADING', payload: loading });
    }, []),

    setChatLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_CHAT_LOADING', payload: loading });
    }, []),

    setEmailLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_EMAIL_LOADING', payload: loading });
    }, []),

    setCalendarLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_CALENDAR_LOADING', payload: loading });
    }, []),

    incrementEmailNotifications: useCallback(() => {
      dispatch({ type: 'INCREMENT_EMAIL_NOTIFICATIONS' });
    }, []),

    incrementCalendarNotifications: useCallback(() => {
      dispatch({ type: 'INCREMENT_CALENDAR_NOTIFICATIONS' });
    }, []),

    clearEmailNotifications: useCallback(() => {
      dispatch({ type: 'CLEAR_EMAIL_NOTIFICATIONS' });
    }, []),

    clearCalendarNotifications: useCallback(() => {
      dispatch({ type: 'CLEAR_CALENDAR_NOTIFICATIONS' });
    }, []),
  };

  // Fetch settings when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && user?.uid) {
      const fetchSettings = async () => {
        try {
          const userSettings = await SettingsService.getSettings(user.uid);
          dispatch({ type: 'SET_SETTINGS', payload: userSettings });
          
          // Apply theme from settings
          const themeToApply = userSettings.theme === 'system' 
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : userSettings.theme;
          
          setNextTheme(themeToApply);
          dispatch({ type: 'SET_THEME', payload: themeToApply });

          // Apply UI language from settings
          if (userSettings.language) {
            const uiLanguage = userSettings.language.startsWith('de') ? 'de' : 'en';
            await setUserLanguage(uiLanguage);
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
          // Still apply default theme
          const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          setNextTheme(systemTheme);
          dispatch({ type: 'SET_THEME', payload: systemTheme });
        }
      };
      
      fetchSettings();
    } else if (!isAuthenticated) {
      // Clear settings when logged out
      dispatch({ type: 'SET_SETTINGS', payload: null });
    }
  }, [isAuthenticated, user?.uid, setNextTheme]);

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppContext;