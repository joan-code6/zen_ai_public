import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Chrome } from 'lucide-react';

interface GoogleSignInProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  disabled?: boolean;
}

export default function GoogleSignIn({ onSuccess, onError, className = '', disabled = false }: GoogleSignInProps) {
  const { loginWithGoogle, isLoading } = useAuth();
  const { actions } = useApp();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignIn = useCallback(async () => {
    if (isLoading || isGoogleLoading || disabled) return;

    setIsGoogleLoading(true);

    try {
      // First try to use Google's GSI if available
      if (window.google?.accounts?.id) {
        // Use Google's One Tap sign-in
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Fallback to popup sign-in
            initializeGSI();
          }
        });
      } else {
        // Load GSI library and initialize
        await loadGSILibrary();
        initializeGSI();
      }
    } catch (error) {
      console.error('Google Sign-In initialization failed:', error);
      handleGoogleError(error instanceof Error ? error : new Error('Google Sign-In failed'));
    } finally {
      setIsGoogleLoading(false);
    }
  }, [isLoading, isGoogleLoading, disabled, onSuccess, onError]);

  const loadGSILibrary = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Sign-In library'));
      
      document.head.appendChild(script);
    });
  };

  const initializeGSI = () => {
    if (!window.google?.accounts?.id) {
      throw new Error('Google Sign-In library not loaded');
    }

    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
      callback: async (response) => {
        try {
          await loginWithGoogle(response.credential);
          actions.addToast('Google Sign-In successful!', 'success');
          onSuccess?.();
        } catch (error) {
          handleGoogleError(error instanceof Error ? error : new Error('Authentication failed'));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    // Show the sign-in dialog
    window.google.accounts.id.prompt();
  };

  const handleGoogleError = (error: Error) => {
    console.error('Google Sign-In error:', error);
    actions.addToast(error.message, 'error');
    onError?.(error);
  };

  const isDisabled = disabled || isLoading || isGoogleLoading;

  return (
    <button
      onClick={handleGoogleSignIn}
      disabled={isDisabled}
      className={`w-full flex items-center justify-center gap-3 py-2 px-4 border border-border bg-background hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Chrome className="h-5 w-5" />
      <span className="text-foreground font-medium">
        {isGoogleLoading ? 'Connecting...' : 'Continue with Google'}
      </span>
    </button>
  );
}

// Extend the Window interface to include Google types
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          disableAutoSelect: () => void;
          storeState: (state: any) => void;
          clear: () => void;
        };
        oauth2?: {
          initTokenClient: (config: any) => any;
          revoke: (accessToken: string) => void;
        };
      };
    };
  }
}

// Environment variable for Google Client ID
declare global {
  interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}