import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { Mail, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const { actions } = useApp();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const validateEmail = (): boolean => {
    if (!email.trim()) {
      setFieldError(t('auth.emailRequired'));
      return false;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(t('auth.validEmail'));
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
    } catch (error) {
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
      <div className="min-h-screen flex items-center justify-center p-8 bg-background text-foreground">
        <div className="w-full max-w-md relative z-10">
          <div className="space-y-8">
            <div className="flex justify-center">
              <div className="p-4 bg-accent rounded-2xl">
                <CheckCircle className="h-16 w-16 text-white" />
              </div>
            </div>
            
            <div className="text-center space-y-4">
              <h1 className="text-4xl font-bold font-display text-foreground">
                {t('forgotPassword.checkEmail')}
              </h1>
              <p className="text-lg text-muted-foreground">
                We've sent a password reset link to
              </p>
              <p className="text-xl font-semibold text-foreground">{email}</p>
            </div>

            <div className="space-y-6 text-center">
              <p className="text-muted-foreground">
                Click the link in the email to reset your password. 
                If you don't see the email, check your spam folder.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-hidden">
      <div className="flex-1 lg:flex-1/2 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md relative z-10">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-primary rounded-2xl">
                <Mail className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-4xl font-bold font-display text-foreground">
                {t('forgotPassword.title')}
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              {t('forgotPassword.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-semibold text-foreground">
                {t('forgotPassword.emailAddress')}
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="you@example.com"
                  className={`w-full pl-12 pr-4 py-4 border-2 rounded-xl bg-input text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 ${
                    fieldError 
                      ? 'border-destructive focus:border-destructive focus:ring-destructive/20' 
                      : 'border-border focus:border-primary focus:ring-primary/20'
                  } focus:outline-none focus:ring-4`}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              {fieldError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  {fieldError}
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
              className="w-full py-4 px-6 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? t('forgotPassword.sending') : t('forgotPassword.sendResetLink')}
            </button>

            <div className="text-center pt-4">
              <p className="text-muted-foreground">
                Remember your password?{' '}
                <Link 
                  to="/login" 
                  className="font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  {t('auth.signIn')}
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />
        
        <div className="absolute inset-0 flex items-center justify-center p-16">
          <div className="max-w-lg space-y-8 relative z-10">
            <div className="space-y-4">
              <h2 className="text-5xl font-bold font-display text-foreground">
                {t('marketing.passwordRecovery')}
              </h2>
              <p className="text-xl text-muted-foreground/70 leading-relaxed">
                {t('marketing.passwordRecoveryDescription')}
              </p>
            </div>
             
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{t('marketing.quick')}</h3>
                <p className="text-sm text-muted-foreground/70">{t('marketing.quickDescription')}</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{t('marketing.secureReset')}</h3>
                <p className="text-sm text-muted-foreground/70">{t('marketing.secureResetDescription')}</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{t('marketing.reliable')}</h3>
                <p className="text-sm text-muted-foreground/70">{t('marketing.reliableDescription')}</p>
              </div>
              <div className="p-6 bg-card border-2 border-border shadow-lg rounded-2xl">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{t('marketing.easy')}</h3>
                <p className="text-sm text-muted-foreground/70">{t('marketing.easyDescription')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
