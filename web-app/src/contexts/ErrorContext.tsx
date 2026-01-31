import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface ErrorInfo {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info' | 'success';
  code?: string;
  details?: any;
  timestamp: Date;
  action?: {
    label: string;
    handler: () => void;
  };
}

export interface ErrorBoundaryState {
  errors: ErrorInfo[];
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

export interface ErrorContextType {
  errors: ErrorInfo[];
  addError: (error: Omit<ErrorInfo, 'id' | 'timestamp'>) => void;
  removeError: (id: string) => void;
  clearErrors: () => void;
  handleError: (error: Error, context?: any) => void;
  handleAsyncError: (promise: Promise<any>, context?: any) => Promise<any>;
  getRecentErrors: (type?: ErrorInfo['type'], limit?: number) => ErrorInfo[];
  hasUnreadErrors: () => boolean;
  markAsRead: (id: string) => void;
  retryAction: (id: string) => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [boundaryState, setBoundaryState] = useState<ErrorBoundaryState>({
    errors: [],
    hasError: false,
    error: null,
    errorInfo: null
  });

  const generateErrorId = useCallback(() => {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const addError = useCallback((error: Omit<ErrorInfo, 'id' | 'timestamp'>) => {
    const errorInfo: ErrorInfo = {
      id: generateErrorId(),
      timestamp: new Date(),
      ...error
    };

    setErrors(prev => {
      const filtered = prev.filter(e => e.message !== error.message || e.type !== error.type);
      return [errorInfo, ...filtered].slice(0, 50); // Keep last 50 errors
    });
  }, [generateErrorId]);

  const removeError = useCallback((id: string) => {
    setErrors(prev => prev.filter(error => error.id !== id));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const handleError = useCallback((error: Error, context?: any) => {
    console.error('Error caught:', error, context);

    const errorInfo = {
      message: error.message || 'An unexpected error occurred',
      type: 'error' as const,
      code: error.name,
      details: {
        stack: error.stack,
        context,
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    };

    addError(errorInfo);
  }, [addError]);

  const handleAsyncError = useCallback(async (promise: Promise<any>, context?: any) => {
    try {
      return await promise;
    } catch (error) {
      handleError(error as Error, context);
      throw error; // Re-throw for upstream handling
    }
  }, [handleError]);

  const getRecentErrors = useCallback((type?: ErrorInfo['type'], limit: number = 10) => {
    let filtered = errors;
    if (type) {
      filtered = filtered.filter(error => error.type === type);
    }
    return filtered.slice(0, limit);
  }, [errors]);

  const hasUnreadErrors = useCallback(() => {
    return errors.some(error => error.type === 'error');
  }, [errors]);

  const markAsRead = useCallback((id: string) => {
    // In a real implementation, this might mark as read in a database
    // For now, we'll just remove it from the unread count
    setErrors(prev => prev.map(error => 
      error.id === id ? { ...error, type: 'info' as const } : error
    ));
  }, []);

  const retryAction = useCallback((id: string) => {
    const error = errors.find(e => e.id === id);
    if (error?.action) {
      removeError(id);
      error.action.handler();
    }
  }, [errors, removeError]);

  // Global error handlers
  React.useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleError(new Error(event.reason), {
        type: 'unhandledPromiseRejection'
      });
      event.preventDefault();
    };

    const handleWindowError = (event: ErrorEvent) => {
      handleError(event.error || new Error(event.message), {
        type: 'windowError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, [handleError]);

  return (
    <ErrorContext.Provider
      value={{
        errors: [...errors, ...boundaryState.errors],
        addError,
        removeError,
        clearErrors,
        handleError,
        handleAsyncError,
        getRecentErrors,
        hasUnreadErrors,
        markAsRead,
        retryAction
      }}
    >
      {children}
    </ErrorContext.Provider>
  );
}

export function useError(): ErrorContextType {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}

// Error Boundary Component
export class ErrorBoundary extends React.Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: Error, errorInfo: any) => void },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = {
      errors: [],
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Add to global error context if available
    try {
      const errorEvent = new CustomEvent('reactError', {
        detail: { error, errorInfo }
      });
      window.dispatchEvent(errorEvent);
    } catch (e) {
      console.error('Failed to dispatch error event:', e);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-destructive"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="16" y1="16" x2="12" y2="12" />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
            
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              
              {import.meta.env.DEV && (
                <details className="text-left">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    Technical Details
                  </summary>
                  <pre className="text-xs bg-muted p-4 rounded-lg mt-2 overflow-auto">
                    {this.state.error?.stack}
                    {this.state.errorInfo && '\n' + JSON.stringify(this.state.errorInfo, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Reload Page
              </button>
              
              <button
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error Display Components
export function ErrorToast({ error, onDismiss }: { error: ErrorInfo; onDismiss: () => void }) {
  const getIcon = () => {
    switch (error.type) {
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 17"></polyline>
            <path d="m20 6-7 7"></path>
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <path d="m21.73 8-7.46 7.46"></path>
            <path d="M18.36 12.18 8.82 8.82"></path>
            <path d="m12 2-10 10"></path>
            <path d="M12 22v-4"></path>
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5 text-blue-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="16" y1="16" x2="12" y2="12"></line>
          </svg>
        );
    }
  };

  const getBgColor = () => {
    switch (error.type) {
      case 'success': return 'bg-green-100 border-green-200 text-green-800';
      case 'warning': return 'bg-yellow-100 border-yellow-200 text-yellow-800';
      case 'info': return 'bg-blue-100 border-blue-200 text-blue-800';
      default: return 'bg-red-100 border-red-200 text-red-800';
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getBgColor()} animate-fade-in`}>
      <div className="flex items-start gap-3">
        {getIcon()}
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{error.message}</p>
          
          {error.details && import.meta.env.DEV && (
            <details className="mt-2">
              <summary className="text-xs opacity-75 cursor-pointer">Details</summary>
              <pre className="text-xs mt-2 overflow-auto bg-black/10 p-2 rounded">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          )}
          
          {error.action && (
            <button
              onClick={() => {
                onDismiss();
                error.action.handler();
              }}
              className="mt-2 text-xs underline hover:no-underline"
            >
              {error.action.label}
            </button>
          )}
        </div>
        
        <button
          onClick={onDismiss}
          className="text-current/50 hover:text-current"
        >
          <svg className="w-4 h-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ErrorList() {
  const { errors, removeError, clearErrors } = useError();

  if (errors.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p>No errors recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Error Log ({errors.length})</h3>
        <button
          onClick={clearErrors}
          className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
        >
          Clear All
        </button>
      </div>
      
      <div className="max-h-96 overflow-auto space-y-2">
        {errors.map((error) => (
          <ErrorToast
            key={error.id}
            error={error}
            onDismiss={() => removeError(error.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Hook for common error scenarios
export function useErrorHandler() {
  const { addError, handleAsyncError } = useError();

  const handleNetworkError = useCallback((error: any) => {
    addError({
      message: 'Network connection failed. Please check your internet connection.',
      type: 'error',
      details: error
    });
  }, [addError]);

  const handleApiError = useCallback((response: any) => {
    const message = response?.error?.message || 'API request failed';
    const code = response?.error?.code;
    
    addError({
      message,
      type: 'error',
      code,
      details: response,
      action: code === 'UNAUTHORIZED' ? {
        label: 'Sign In Again',
        handler: () => {
          // Redirect to login or trigger re-auth
          window.location.reload();
        }
      } : undefined
    });
  }, [addError]);

  const handleValidationError = useCallback((errors: any) => {
    const message = Array.isArray(errors) 
      ? errors.join(', ') 
      : errors?.message || 'Validation failed';
    
    addError({
      message,
      type: 'warning'
    });
  }, [addError]);

  const handleSuccess = useCallback((message: string, details?: any) => {
    addError({
      message,
      type: 'success',
      details
    });
  }, [addError]);

  const handleInfo = useCallback((message: string, details?: any) => {
    addError({
      message,
      type: 'info',
      details
    });
  }, [addError]);

  return {
    handleNetworkError,
    handleApiError,
    handleValidationError,
    handleSuccess,
    handleInfo,
    handleAsyncError
  };
}