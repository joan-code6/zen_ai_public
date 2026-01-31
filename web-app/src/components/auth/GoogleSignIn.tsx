import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeGoogleSignIn = async () => {
      try {
        if (!window.google?.accounts?.id) {
          await loadGSILibrary();
        }
        initializeGSI();
      } catch (error) {
        console.error('Google Sign-In initialization failed:', error);
      }
    };

    initializeGoogleSignIn();
  }, []);

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
      use_fedcm_for_prompt: true,
    });

    // Render the Google Sign-In button
    if (buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'left',
      });
    }

    // Also show One Tap if possible
    window.google.accounts.id.prompt();
  };

  const handleGoogleError = (error: Error) => {
    console.error('Google Sign-In error:', error);
    actions.addToast(error.message, 'error');
    onError?.(error);
  };

  return (
    <div
      ref={buttonRef}
      className={`w-full flex items-center justify-center ${className}`}
      style={{ minHeight: '40px' }}
    />
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