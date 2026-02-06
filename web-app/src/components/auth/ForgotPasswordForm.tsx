import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

interface ForgotPasswordFormProps {
  onSuccess?: () => void;
  onBack?: () => void;
}

export default function ForgotPasswordForm({ onSuccess, onBack }: ForgotPasswordFormProps) {
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const { actions } = useApp();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const validateEmail = (): boolean => {
    if (!email.trim()) {
      setFieldError('Email is required');
      return false;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError('Please enter a valid email address');
      return false;
    }
    
    setFieldError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail()) {
      return;
    }

    try {
      await resetPassword(email);
      setIsSubmitted(true);
      actions.addToast('Password reset email sent successfully!', 'success');
      onSuccess?.();
    } catch (error) {
      // Error is handled by the auth context
      console.error('Password reset failed:', error);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (fieldError) {
      setFieldError('');
    }
    if (error) {
      clearError();
    }
  };

  if (isSubmitted) {
    return (
      <div className="w-full max-w-md mx-auto text-center space-y-6">
        <div className="flex justify-center">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Check Your Email</h2>
          <p className="text-muted-foreground">
            We've sent a password reset link to
          </p>
          <p className="font-medium text-foreground">{email}</p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click the link in the email to reset your password. 
            If you don't see the email, check your spam folder.
          </p>
          
          <button
            onClick={() => {
              setIsSubmitted(false);
              setEmail('');
              onBack?.();
            }}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">Reset Password</h2>
          <p className="text-muted-foreground">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="Enter your email"
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-input text-foreground placeholder:text-muted-foreground ${
                  fieldError ? 'border-destructive' : 'border-border'
                }`}
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
            {fieldError && (
              <p className="mt-1 text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldError}
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={onBack}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-border bg-background hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}