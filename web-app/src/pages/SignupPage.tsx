import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { SignupCredentials } from '@/services';
import { Eye, EyeOff, Mail, Lock, AlertCircle, Sparkles, ArrowRight, Brain, Zap, Shield } from 'lucide-react';
import GoogleSignIn from '../components/auth/GoogleSignIn';

export default function SignupPage() {
  const { signup, isLoading, error, clearError, isAuthenticated } = useAuth();
  const { actions } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [credentials, setCredentials] = React.useState<SignupCredentials>({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const from = (location.state as any)?.from?.pathname || '/';

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

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
      errors.password = 'Must contain uppercase, lowercase, and number';
    }

    if (!credentials.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (credentials.password !== credentials.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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
      const { confirmPassword, ...signupData } = credentials;
      await signup(signupData as any);
      actions.addToast('Account created successfully!', 'success');
      navigate('/onboarding', { replace: true });
    } catch (error) {
      console.error('Signup failed:', error);
    }
  };

  const handleInputChange = (field: keyof SignupCredentials) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value,
    }));
    
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }

    if (error) {
      clearError();
    }
  };

  const handleGoogleSuccess = () => {
    actions.addToast('Account created successfully!', 'success');
    navigate('/onboarding', { replace: true });
  };

  const getPasswordStrength = () => {
    const password = credentials.password;
    if (!password) return 0;
    
    let strength = 0;
    if (password.length >= 6) strength += 1;
    if (password.length >= 10) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/\d/.test(password)) strength += 1;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1;
    
    return Math.min(strength, 4);
  };

  const passwordStrength = getPasswordStrength();

  const strengthColors = [
    'bg-destructive',
    'bg-destructive',
    'bg-orange-400',
    'bg-green-400',
    'bg-green-600'
  ];

  const strengthLabels = [
    'Very weak',
    'Weak',
    'Fair',
    'Strong',
    'Very strong'
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-hidden">
      <div className="flex-1 lg:flex-1/2 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md relative z-10">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-4xl font-bold font-display text-foreground">
                Create Account
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Start your AI-powered journey today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-foreground">
                Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={credentials.email}
                  onChange={handleInputChange('email')}
                  placeholder="you@example.com"
                  className={`w-full pl-12 pr-4 py-4 border-2 rounded-xl bg-input text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 ${
                    fieldErrors.email 
                      ? 'border-destructive focus:border-destructive focus:ring-destructive/20' 
                      : 'border-border focus:border-accent focus:ring-accent/20'
                  } focus:outline-none focus:ring-4`}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              {fieldErrors.email && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold text-foreground">
                Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={handleInputChange('password')}
                  placeholder="•••••••"
                  className={`w-full pl-12 pr-12 py-4 border-2 rounded-xl bg-input text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 ${
                    fieldErrors.password 
                      ? 'border-destructive focus:border-destructive focus:ring-destructive/20' 
                      : 'border-border focus:border-accent focus:ring-accent/20'
                  } focus:outline-none focus:ring-4`}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              
              {credentials.password && (
                <div className="space-y-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          index < passwordStrength ? strengthColors[passwordStrength] : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${
                    passwordStrength < 2 ? 'text-destructive' : 
                    passwordStrength < 3 ? 'text-orange-400' : 
                    passwordStrength < 4 ? 'text-green-400' : 'text-green-600'
                  }`}>
                    {strengthLabels[passwordStrength]}
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Must contain at least 6 characters with uppercase, lowercase, and numbers
              </p>

              {fieldErrors.password && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-foreground">
                Confirm Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={credentials.confirmPassword}
                  onChange={handleInputChange('confirmPassword')}
                  placeholder="••••••••"
                  className={`w-full pl-12 pr-12 py-4 border-2 rounded-xl bg-input text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 ${
                    fieldErrors.confirmPassword 
                      ? 'border-destructive focus:border-destructive focus:ring-destructive/20' 
                      : credentials.confirmPassword && credentials.confirmPassword === credentials.password
                      ? 'border-accent focus:border-accent focus:ring-accent/20'
                      : 'border-border focus:border-accent focus:ring-accent/20'
                  } focus:outline-none focus:ring-4`}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted/50"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              
              {credentials.confirmPassword && credentials.confirmPassword === credentials.password && (
                <div className="flex items-center gap-1.5 text-sm text-accent">
                  <AlertCircle className="h-4 w-4" />
                  Passwords match
                </div>
              )}
              
              {fieldErrors.confirmPassword && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            {error && (
              <div className="p-4 bg-destructive/10 border-2 border-destructive/20 rounded-xl animate-shake">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-4 px-6 bg-accent text-primary-foreground font-semibold rounded-xl hover:bg-accent/90 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-background text-muted-foreground font-medium">Or sign up with</span>
              </div>
            </div>

            <GoogleSignIn onSuccess={handleGoogleSuccess} />

            <div className="text-center pt-4">
              <p className="text-muted-foreground">
                Already have an account?{' '}
                <Link 
                  to="/login" 
                  state={{ from }}
                  className="font-semibold text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 group"
                >
                  Sign in
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-primary/10 to-secondary/10" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />
        
        <div className="absolute inset-0 flex items-center justify-center p-16">
          <div className="max-w-lg space-y-8 relative z-10">
            <div className="space-y-4">
              <h2 className="text-5xl font-bold font-display text-foreground">
                Join the Future
              </h2>
              <p className="text-xl text-muted-foreground/70 leading-relaxed">
                Create your account and unlock the full potential of AI-powered productivity.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Smart AI</h3>
                <p className="text-sm text-muted-foreground/70">Intelligent assistance at your fingertips</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Email Sync</h3>
                <p className="text-sm text-muted-foreground/70">Seamless email integration</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mb-3">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Secure</h3>
                <p className="text-sm text-muted-foreground/70">Enterprise-grade security</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">Fast</h3>
                <p className="text-sm text-muted-foreground/70">Lightning-fast performance</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
