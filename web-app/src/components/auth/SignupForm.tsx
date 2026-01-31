import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { SignupCredentials } from '@/services';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle } from 'lucide-react';

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export default function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const { signup, isLoading, error, clearError } = useAuth();
  const { actions } = useApp();
  const [credentials, setCredentials] = useState<SignupCredentials>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Clear auth errors when form changes
  useEffect(() => {
    if (error) {
      clearError();
    }
  }, [credentials.email, credentials.password, credentials.displayName, error, clearError]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!credentials.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!credentials.password) {
      errors.password = 'Password is required';
    } else if (credentials.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(credentials.password)) {
      errors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
    }

    if (!credentials.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (credentials.password !== credentials.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (credentials.displayName && credentials.displayName.trim().length < 2) {
      errors.displayName = 'Display name must be at least 2 characters';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // Remove confirmPassword before sending to API
      const { confirmPassword, ...signupData } = credentials;
      await signup(signupData as any);
      actions.addToast('Account created successfully!', 'success');
      onSuccess?.();
    } catch (error) {
      // Error is handled by the auth context
      console.error('Signup failed:', error);
    }
  };

  const handleInputChange = (field: keyof SignupCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-2">
            Display Name (Optional)
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="displayName"
              type="text"
              value={credentials.displayName}
              onChange={handleInputChange('displayName')}
              placeholder="Enter your name"
              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-input text-foreground placeholder:text-muted-foreground ${
                fieldErrors.displayName ? 'border-destructive' : 'border-border'
              }`}
              disabled={isLoading}
              autoComplete="name"
            />
          </div>
          {fieldErrors.displayName && (
            <p className="mt-1 text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {fieldErrors.displayName}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="email"
              type="email"
              value={credentials.email}
              onChange={handleInputChange('email')}
              placeholder="Enter your email"
              className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-input text-foreground placeholder:text-muted-foreground ${
                fieldErrors.email ? 'border-destructive' : 'border-border'
              }`}
              disabled={isLoading}
              autoComplete="email"
            />
          </div>
          {fieldErrors.email && (
            <p className="mt-1 text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={credentials.password}
              onChange={handleInputChange('password')}
              placeholder="Create a password"
              className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-input text-foreground placeholder:text-muted-foreground ${
                fieldErrors.password ? 'border-destructive' : 'border-border'
              }`}
              disabled={isLoading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="mt-1 text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {fieldErrors.password}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Must contain at least 6 characters with uppercase, lowercase, and numbers
          </p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={credentials.confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              placeholder="Confirm your password"
              className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-input text-foreground placeholder:text-muted-foreground ${
                fieldErrors.confirmPassword ? 'border-destructive' : 'border-border'
              }`}
              disabled={isLoading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Creating Account...' : 'Sign Up'}
        </button>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-primary hover:text-primary/80 transition-colors font-medium"
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}

export interface ExtendedSignupCredentials extends SignupCredentials {
  confirmPassword: string;
}