import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
  useEffect
} from 'react';
import { useAuth } from './AuthContext';
import Toast from '@/components/Toast';

// Types
export interface ToastMessage {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export interface AppState {
  toasts: ToastMessage[];
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
}

type AppAction =
  | { type: 'ADD_TOAST'; payload: Omit<ToastMessage, 'id'> }
  | { type: 'REMOVE_TOAST'; payload: string }
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
  | { type: 'CLEAR_CALENDAR_NOTIFICATIONS' };

const initialState: AppState = {
  toasts: [],
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
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [
          ...state.toasts,
          {
            ...action.payload,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          },
        ],
      };

    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.payload),
      };

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
    addToast: (message: string, variant?: ToastMessage['variant'], duration?: number) => void;
    removeToast: (id: string) => void;
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
  const { isAuthenticated } = useAuth();

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const storedTheme = localStorage.getItem('zen_theme') as 'light' | 'dark' | null;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = storedTheme || systemTheme;
    
    dispatch({ type: 'SET_THEME', payload: theme });
    
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

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

  // Auto-remove toasts
  useEffect(() => {
    const timers = state.toasts.map((toast) => {
      const duration = toast.duration || 5000;
      return setTimeout(() => {
        dispatch({ type: 'REMOVE_TOAST', payload: toast.id });
      }, duration);
    });

    return () => timers.forEach(clearTimeout);
  }, [state.toasts]);

  // Clear notifications when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      dispatch({ type: 'CLEAR_EMAIL_NOTIFICATIONS' });
      dispatch({ type: 'CLEAR_CALENDAR_NOTIFICATIONS' });
    }
  }, [isAuthenticated]);

  const actions = {
    addToast: useCallback((message: string, variant: ToastMessage['variant'] = 'info', duration?: number) => {
      dispatch({ type: 'ADD_TOAST', payload: { message, variant, duration } });
    }, []),

    removeToast: useCallback((id: string) => {
      dispatch({ type: 'REMOVE_TOAST', payload: id });
    }, []),

    setTheme: useCallback((theme: 'light' | 'dark') => {
      dispatch({ type: 'SET_THEME', payload: theme });
      localStorage.setItem('zen_theme', theme);
      
      // Apply theme to document
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }, []),

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

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {state.toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            variant={toast.variant}
            onClose={() => actions.removeToast(toast.id)}
          />
        ))}
      </div>
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