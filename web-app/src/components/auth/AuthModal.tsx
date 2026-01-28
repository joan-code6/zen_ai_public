import React, { useState } from 'react';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import GoogleSignIn from './GoogleSignIn';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { X, Sparkles } from 'lucide-react';

type AuthView = 'login' | 'signup' | 'forgot-password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: AuthView;
  redirectTo?: string;
}

export default function AuthModal({ isOpen, onClose, initialView = 'login', redirectTo }: AuthModalProps) {
  const { isAuthenticated } = useAuth();
  const { actions } = useApp();
  const [currentView, setCurrentView] = useState<AuthView>(initialView);

  // Auto-close if user becomes authenticated
  React.useEffect(() => {
    if (isAuthenticated && isOpen) {
      handleClose();
    }
  }, [isAuthenticated, isOpen]);

  const handleClose = () => {
    setCurrentView('login');
    onClose();
  };

  const handleAuthSuccess = () => {
    if (redirectTo) {
      window.location.href = redirectTo;
    } else {
      handleClose();
    }
  };

  const handleBackToLogin = () => {
    setCurrentView('login');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted/50 transition-colors z-10"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {currentView === 'login' && 'Welcome Back'}
            {currentView === 'signup' && 'Create Account'}
            {currentView === 'forgot-password' && 'Reset Password'}
          </h1>
          
          <p className="text-muted-foreground text-sm">
            {currentView === 'login' && 'Sign in to your account to continue'}
            {currentView === 'signup' && 'Join Zen AI to get started'}
            {currentView === 'forgot-password' && "We'll help you get back to your account"}
          </p>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">
          {currentView === 'login' && (
            <div className="space-y-6">
              <LoginForm
                onSuccess={handleAuthSuccess}
                onSwitchToSignup={() => setCurrentView('signup')}
                onForgotPassword={() => setCurrentView('forgot-password')}
              />
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-background text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <GoogleSignIn onSuccess={handleAuthSuccess} />
            </div>
          )}

          {currentView === 'signup' && (
            <div className="space-y-6">
              <SignupForm
                onSuccess={handleAuthSuccess}
                onSwitchToLogin={handleBackToLogin}
              />
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-background text-muted-foreground">Or sign up with</span>
                </div>
              </div>

              <GoogleSignIn onSuccess={handleAuthSuccess} />
            </div>
          )}

          {currentView === 'forgot-password' && (
            <ForgotPasswordForm
              onSuccess={handleAuthSuccess}
              onBack={handleBackToLogin}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Hook for using the auth modal
export function useAuthModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [initialView, setInitialView] = React.useState<AuthView>('login');
  const [redirectTo, setRedirectTo] = React.useState<string | undefined>();

  const openModal = React.useCallback((view: AuthView = 'login', redirect?: string) => {
    setInitialView(view);
    setRedirectTo(redirect);
    setIsOpen(true);
  }, []);

  const closeModal = React.useCallback(() => {
    setIsOpen(false);
    setInitialView('login');
    setRedirectTo(undefined);
  }, []);

  return {
    isOpen,
    openModal,
    closeModal,
    initialView,
    redirectTo,
  };
}