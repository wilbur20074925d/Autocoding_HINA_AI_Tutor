import React, { useCallback, useState } from 'react';
import { translate, type MessageKey } from '../../i18n/messages';
import { User, Lock, LogIn, Mail, Eye, EyeOff, ArrowLeft, GraduationCap, UserCircle, Shield, QrCode as QrCodeIcon, AlertCircle } from 'lucide-react';
import { AuthService } from '../../services/authService';
import type { User as UserType } from '../../lib/supabase';
import { TwoFactorAuthService } from '../../services/twoFactorAuthService';
import { isStaffRole } from '../../utils/roles';
import QRCode from 'react-qr-code';
import { AnimatedCharacters } from './AnimatedCharacters.tsx';

interface LoginFormProps {
  onLogin: (user: UserType) => void;
}

type AuthMode =
  | 'signin'
  | 'signup'
  | 'forgot-password'
  | 'verify-otp'
  | 'reset-password'
  | 'twofactor-setup'
  | 'twofactor-verify';

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  // Login stays in English regardless of the app language preference.
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string>) => translate('en', key, vars),
    []
  );
  const [mode, setMode] = useState<AuthMode>('signin');
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher' | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    role: 'student' as 'student' | 'teacher',
    verificationCode: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [pendingUser, setPendingUser] = useState<UserType | null>(null);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string>('');
  const [twoFactorUrl, setTwoFactorUrl] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      switch (mode) {
        case 'signin':
          if (!selectedRole) {
            setMessage({ type: 'error', text: 'Please select your role first' });
            break;
          }
          
          const signInResult = await AuthService.signIn({
            email: formData.email,
            password: formData.password
          });
          
          if (signInResult.error) {
            setMessage({ type: 'error', text: signInResult.error.message });
          } else if (signInResult.user) {
            // New login attempt – always clear any previous 2FA verification flag
            AuthService.clearTwoFactorVerification();
            // Teacher portal: teachers and platform admins both sign in here (2FA).
            const portalMatches =
              selectedRole === 'teacher'
                ? isStaffRole(signInResult.user.role)
                : signInResult.user.role === selectedRole;
            if (!portalMatches) {
              setMessage({ 
                type: 'error', 
                text: `This account is registered as a ${signInResult.user.role}. Pick Student or Teacher/Admin to match your account.` 
              });
              setSelectedRole(null); // Reset role selection
              // Sign out to clear the session
              await AuthService.signOut();
            } else {
              // Role matches – now handle 2FA
              setMessage(null);

              // Students skip 2FA authentication - directly log them in
              if (signInResult.user.role === 'student') {
                // Mark as verified for students (no 2FA required)
                AuthService.markTwoFactorVerified(signInResult.user.id);
                onLogin(signInResult.user);
              } else {
                // Teachers must complete 2FA
                // If user already has 2FA enabled, go straight to verification step
                if (signInResult.user.twofa_enabled) {
                  setPendingUser(signInResult.user);
                  setTwoFactorCode('');

                  // Fetch existing secret for code verification (QR code not shown on subsequent logins)
                  const existingSecret = await AuthService.getTwoFactorSecret(signInResult.user.id);
                  if (!existingSecret) {
                    setMessage({
                      type: 'error',
                      text: 'Two-factor authentication is not fully configured for this account. Please contact support.',
                    });
                    await AuthService.signOut();
                    setSelectedRole(null);
                    break;
                  }

                  setTwoFactorSecret(existingSecret);
                  // No need to build QR URL for subsequent logins - only show 2-digit input
                  setTwoFactorUrl('');
                  setMode('twofactor-verify');
                } else {
                  // First-time login: generate a new TOTP secret and enrollment QR code
                  // DO NOT persist the secret yet - wait for user to scan QR and verify code first
                  const { secret, otpauthUrl } = TwoFactorAuthService.generateSecret(
                    signInResult.user.id,
                    signInResult.user.id,
                    'StreamLearn',
                    signInResult.user.name || 'Account'
                  );

                  // Store secret temporarily (not in DB yet) and show QR code for scanning
                  setPendingUser(signInResult.user); // Keep original user object (twofa_enabled is still false)
                  setTwoFactorSecret(secret);
                  setTwoFactorUrl(otpauthUrl);
                  setTwoFactorCode('');
                  setMode('twofactor-setup');
                }
              }
            }
          } else {
            setMessage({ type: 'error', text: 'Authentication service is not available. Please try again later.' });
          }
          break;

        case 'signup':
          if (formData.password !== formData.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            break;
          }
          
          // Always use 'student' role for signup
          const signUpResult = await AuthService.signUp({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            role: 'student'
          });
          
          if (signUpResult.error) {
            setMessage({ type: 'error', text: signUpResult.error.message });
          } else {
            setMessage({ 
              type: 'success', 
              text: 'Account created! Please check your email to verify your account.' 
            });
            setMode('signin');
            setSelectedRole(null); // Reset role selection for signin
          }
          break;

        case 'forgot-password':
          const otpResult = await AuthService.requestPasswordResetOTP(formData.email);
          
          if (otpResult.error) {
            setMessage({ type: 'error', text: otpResult.error.message });
          } else {
            setMessage({ 
              type: 'success', 
              text: 'A 6-digit code has been sent to your email. Please check your inbox.' 
            });
            setResetEmailSent(true);
            setResetEmail(formData.email);
            setMode('verify-otp');
          }
          break;

        case 'verify-otp':
          if (formData.verificationCode.length !== 6) {
            setMessage({ type: 'error', text: 'Please enter a 6-digit code' });
            break;
          }

          const verifyResult = await AuthService.verifyPasswordResetOTP(
            resetEmail || formData.email,
            formData.verificationCode
          );
          
          if (verifyResult.error || !verifyResult.verified) {
            setMessage({ 
              type: 'error', 
              text: verifyResult.error?.message || 'Invalid or expired code. Please try again.' 
            });
          } else {
            setMessage({ 
              type: 'success', 
              text: 'Code verified! Please set your new password.' 
            });
            setOtpVerified(true);
            setMode('reset-password');
          }
          break;

        case 'reset-password':
          if (formData.password !== formData.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            break;
          }

          if (formData.password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
            break;
          }

          if (!otpVerified) {
            setMessage({ type: 'error', text: 'Please verify your OTP code first' });
            setMode('verify-otp');
            break;
          }
          
          const resetResult = await AuthService.resetPasswordWithOTP(
            resetEmail || formData.email,
            formData.verificationCode,
            formData.password
          );
          
          if (resetResult.error) {
            setMessage({ type: 'error', text: resetResult.error.message });
          } else {
            setMessage({ 
              type: 'success', 
              text: 'Password reset successfully! You can now sign in with your new password.' 
            });
            // Reset form state
            setMode('signin');
            setSelectedRole(null); // Reset role selection for signin
            setOtpVerified(false);
            setResetEmailSent(false);
            setResetEmail('');
            setFormData({
              email: '',
              password: '',
              confirmPassword: '',
              name: '',
              role: 'student',
              verificationCode: ''
            });
          }
          break;

        case 'twofactor-setup':
          if (!pendingUser || !twoFactorSecret) {
            setMessage({
              type: 'error',
              text: 'Two-factor setup session expired. Please sign in again.'
            });
            setMode('signin');
            setSelectedRole(null);
            break;
          }

          if (twoFactorCode.length !== 2) {
            setMessage({
              type: 'error',
              text: 'Please scan the QR code with your authenticator app first, then enter the 2-digit code from your device.'
            });
            break;
          }

          try {
            // Generate the current 6-digit TOTP code and compare last 2 digits
            const fullCode = TwoFactorAuthService.getCurrentCode(twoFactorSecret);
            const shortCode = fullCode.slice(-2);

            if (twoFactorCode !== shortCode) {
              setMessage({
                type: 'error',
                text: 'Invalid 2FA code. Please make sure you scanned the QR code and entered the last 2 digits from your authenticator app.'
              });
              setTwoFactorCode('');
              break;
            }

            // Code is valid - NOW persist the secret and mark 2FA as enabled
            const enableResult = await AuthService.enableTwoFactorForUser(pendingUser.id, twoFactorSecret);
            if (enableResult.error) {
              setMessage({
                type: 'error',
                text: 'Code verified, but failed to save 2FA configuration. Please try again.'
              });
              break;
            }

            // 2FA enrollment + verification successful – complete login
            setMessage(null);
            AuthService.markTwoFactorVerified(pendingUser.id);
            
            // Update pending user to reflect 2FA is now enabled
            const updatedUser = {
              ...pendingUser,
              twofa_enabled: true,
              twofa_enrolled_at: new Date().toISOString()
            };
            onLogin(updatedUser);
          } catch (error) {
            console.error('Error during 2FA setup verification:', error);
            setMessage({
              type: 'error',
              text: 'Failed to verify your 2FA code. Please try again.'
            });
          }
          break;

        case 'twofactor-verify':
          if (!pendingUser) {
            setMessage({
              type: 'error',
              text: 'Two-factor session expired. Please sign in again.'
            });
            setMode('signin');
            setSelectedRole(null);
            break;
          }

          if (twoFactorCode.length !== 2) {
            setMessage({
              type: 'error',
              text: 'Please enter the 2-digit code from your authenticator device.'
            });
            break;
          }

          try {
            let secretToUse = twoFactorSecret;
            if (!secretToUse) {
              // Fetch secret from database (status-only user object does not include it)
              const fetchedSecret = await AuthService.getTwoFactorSecret(pendingUser.id);
              if (!fetchedSecret) {
                setMessage({
                  type: 'error',
                  text: 'Two-factor authentication is not fully configured for this account. Please contact support.'
                });
                await AuthService.signOut();
                setMode('signin');
                setSelectedRole(null);
                break;
              }
              secretToUse = fetchedSecret;
              setTwoFactorSecret(fetchedSecret);
            }

            const fullCode = TwoFactorAuthService.getCurrentCode(secretToUse);
            const shortCode = fullCode.slice(-2);

            if (twoFactorCode !== shortCode) {
              setMessage({
                type: 'error',
                text: 'Invalid 2FA code. Please double-check the code on your device.'
              });
              setTwoFactorCode('');
              break;
            }

            setMessage(null);
            AuthService.markTwoFactorVerified(pendingUser.id);
            onLogin(pendingUser);
          } catch (error) {
            console.error('Error during 2FA verification:', error);
            setMessage({
              type: 'error',
              text: 'Failed to verify your 2FA code. Please try again.'
            });
          }
          break;
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };


  const renderForm = () => {
    switch (mode) {
      case 'signin':
        // Show role selection first if not selected
        if (!selectedRole) {
          return (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedRole('student')}
                className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/55 px-3 py-4 text-center shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:bg-white/80"
              >
                <div className="rounded-full bg-slate-900 p-2.5 text-white shadow-sm ring-1 ring-slate-900/10 transition group-hover:bg-slate-800">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-slate-900">
                  {t('role.student')}
                </span>
                <span className="text-center text-xs font-medium leading-snug text-slate-600">
                  {t('auth.hereToLearn')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole('teacher')}
                className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/70 bg-white/55 px-3 py-4 text-center shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:bg-white/80"
              >
                <div className="rounded-full bg-slate-900 p-2.5 text-white shadow-sm ring-1 ring-slate-900/10 transition group-hover:bg-slate-800">
                  <UserCircle className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-slate-900">
                  {t('auth.teacherAdmin')}
                </span>
                <span className="text-center text-xs font-medium leading-snug text-slate-600">
                  {t('auth.teacherHint')}
                </span>
              </button>
            </div>
          );
        }

        // Show login form after role selection
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role indicator and change button — matches sidebar account strip */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white shadow-sm">
                  {selectedRole === 'teacher' ? (
                    <UserCircle className="h-4 w-4" />
                  ) : (
                    <GraduationCap className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-slate-600">{t('auth.signingInAs')}</span>
                  <span className="truncate text-sm font-semibold tracking-tight text-black">
                    {selectedRole === 'teacher' ? t('auth.teacherAdmin') : t('role.student')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="flex-shrink-0 rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-xs font-semibold tracking-tight text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {t('auth.change')}
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">{t('auth.email')}</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-3 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="your.email@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">{t('auth.password')}</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-11 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 shadow-sm backdrop-blur-sm">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-400 accent-neutral-900 focus:outline-none focus:ring-2 focus:ring-slate-400/60 focus:ring-offset-0"
                  />
                  <span className="text-xs font-semibold tracking-tight text-slate-700 sm:text-sm">
                    {t('auth.remember')}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="self-start rounded-lg px-1.5 py-0.5 text-left text-xs font-semibold tracking-tight text-slate-700 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-slate-900 sm:self-auto sm:px-2 sm:py-1 sm:text-sm"
                >
                  {t('auth.forgot')}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{t('auth.signIn')}</span>
                </>
              )}
            </button>
          </form>
        );

      case 'signup':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">Full name</label>
              <div className="group relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-3 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Enter your full name"
                  required
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 backdrop-blur-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-white shadow-sm">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold tracking-tight text-black">Student account</span>
                  <span className="text-xs font-medium text-slate-600">Sign up is available for students only</span>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">{t('auth.email')}</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-3 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="your.email@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">{t('auth.password')}</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-11 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Create a password (min. 6 characters)"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">Confirm password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-11 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <GraduationCap className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Create student account</span>
                </>
              )}
            </button>
          </form>
        );

      case 'forgot-password':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">Email</label>
              <div className="group relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-3 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="your.email@example.com"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Mail className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Send 6-Digit Code</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMode('signin')}
              className="w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Back to Sign In
            </button>
          </form>
        );

      case 'verify-otp':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-white/70 bg-white/55 p-4 text-center backdrop-blur-sm">
              <Mail className="mx-auto mb-2 h-7 w-7 text-slate-700" aria-hidden />
              <h3 className="mb-1 text-sm font-semibold tracking-tight text-black">Check your email</h3>
              <p className="text-sm font-medium leading-relaxed text-slate-700">
                We sent a 6-digit code to <span className="font-semibold text-slate-900">{resetEmail || formData.email}</span>
              </p>
              <p className="mt-1.5 text-xs font-medium text-slate-500">The code expires in 10 minutes.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">Enter 6-digit code</label>
              <input
                type="text"
                value={formData.verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  handleInputChange('verificationCode', value);
                }}
                className="w-full rounded-xl border border-white/70 bg-white/70 py-3 text-center font-mono text-2xl tracking-[0.35em] text-black shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                placeholder="000000"
                maxLength={6}
                required
              />
              <p className="mt-2 text-xs font-medium text-slate-500">Enter the 6-digit code from your email</p>
            </div>

            <button
              type="submit"
              disabled={loading || formData.verificationCode.length !== 6}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Verify code</span>
                </>
              )}
            </button>

            <div className="space-y-2">
              <button
                type="button"
                onClick={async () => {
                  setFormData(prev => ({ ...prev, verificationCode: '' }));
                  setMessage(null);
                  const result = await AuthService.requestPasswordResetOTP(resetEmail || formData.email);
                  if (result.error) {
                    setMessage({ type: 'error', text: result.error.message });
                  } else {
                    setMessage({ type: 'success', text: 'New code sent! Please check your email.' });
                  }
                }}
                className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold tracking-tight text-slate-700 transition-colors hover:bg-white/60 hover:text-slate-900"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot-password');
                  setFormData(prev => ({ ...prev, verificationCode: '' }));
                  setMessage(null);
                }}
                className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold tracking-tight text-slate-600 transition-colors hover:bg-white/60 hover:text-slate-900"
              >
                Use a different email
              </button>
            </div>
          </form>
        );

      case 'reset-password':
        return (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
              <h3 className="mb-2 text-sm font-semibold tracking-tight text-black">✓ Code verified</h3>
              <p className="text-sm font-medium leading-relaxed text-slate-700">
                Now enter your new password. Make sure it&apos;s strong and secure.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">New Password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-11 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">Confirm New Password</label>
              <div className="group relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" aria-hidden />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-2.5 pl-10 pr-11 text-sm font-medium tracking-tight text-black placeholder:text-slate-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Update password</span>
                </>
              )}
            </button>
          </form>
        );

      case 'twofactor-setup':
        return (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-xl border border-white/70 bg-white/55 p-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <QrCodeIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h4 className="mb-2 text-sm font-semibold tracking-tight text-slate-900">Setup steps</h4>
                  <ol className="list-inside list-decimal space-y-1.5 text-sm font-medium leading-relaxed text-slate-600">
                    <li>Open your authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.)</li>
                    <li>Add an account and choose <span className="font-semibold text-slate-800">Scan QR code</span></li>
                    <li>Scan the QR code below</li>
                    <li>When your app shows a 6-digit code, enter the <span className="font-semibold text-slate-900">last 2 digits</span> in the field</li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-col items-center">
                <div className="mb-3 rounded-xl border border-white/70 bg-white p-4 shadow-sm backdrop-blur-sm">
                  {twoFactorUrl ? (
                    <QRCode
                      value={twoFactorUrl}
                      size={220}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  ) : (
                    <div className="flex h-52 w-52 items-center justify-center rounded-lg bg-slate-100">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                    </div>
                  )}
                </div>
                <p className="text-center text-xs font-medium tracking-tight text-slate-600">
                  Scan this QR code with your authenticator app to finish setup.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold tracking-tight text-black">
                  2-digit code from your device
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={twoFactorCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setTwoFactorCode(value);
                    setMessage(null);
                  }}
                  className="w-full rounded-xl border border-white/70 bg-white/70 py-3 text-center font-mono text-2xl tracking-[0.5em] text-black shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  placeholder="00"
                  required
                />
                <p className="mt-2 flex items-start gap-2 text-xs font-medium leading-relaxed text-slate-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                  <span>
                    After scanning, your app shows a 6-digit code. Enter the <span className="font-semibold text-slate-900">last 2 digits</span> here.
                  </span>
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Shield className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Verify &amp; complete sign in</span>
                </>
              )}
            </button>

            <p className="text-center text-[11px] font-medium text-slate-500">
              After setup, you&apos;ll use your authenticator for future sign-ins.
            </p>
          </form>
        );

      case 'twofactor-verify':
        return (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold tracking-tight text-black">
                2-digit code from your device
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={twoFactorCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setTwoFactorCode(value);
                  setMessage(null);
                }}
                className="w-full rounded-xl border border-white/70 bg-white/70 py-3 text-center font-mono text-2xl tracking-[0.5em] text-black shadow-sm backdrop-blur-sm transition-all duration-200 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                placeholder="00"
                required
                autoFocus
              />
              <p className="mt-2 flex items-start gap-2 text-xs font-medium leading-relaxed text-slate-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                <span>
                  Open your authenticator app and enter the <span className="font-semibold text-slate-900">last 2 digits</span> of the 6-digit code shown.
                </span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-800 px-3 py-2.5 text-sm font-semibold tracking-tight text-white shadow-sm transition-all duration-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Shield className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Verify &amp; continue</span>
                </>
              )}
            </button>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50">
      <div className="grid h-full w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className="relative hidden h-full flex-col overflow-hidden bg-gradient-to-br from-slate-100/90 to-slate-50 p-10 lg:flex">
          <div className="-mt-2 flex items-center justify-center">
            <img src="/images/streamlearn-logo.png" alt="StreamLearn Logo" className="h-[4.8rem] w-auto" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
            <AnimatedCharacters
              isTyping={isTyping}
              showPassword={showPassword}
              passwordLength={formData.password.length}
            />
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto p-3 sm:p-4 lg:p-6">
          <div className="my-auto w-full max-w-[440px]">
            <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/55 font-sans shadow-[0_10px_40px_-18px_rgba(15,23,42,0.45)] backdrop-blur-2xl">
              <div className="border-b border-slate-200/80 px-4 pb-3 pt-4 md:px-5">
                <div className="mb-3 flex items-center justify-center lg:hidden">
                  <img src="/images/streamlearn-logo.png" alt="StreamLearn" className="h-10 w-auto" />
                </div>
                <h2 className="text-center text-xl font-bold tracking-tight text-black lg:text-left lg:text-2xl">
                  {mode === 'signin'
                    ? t('auth.welcome')
                    : mode === 'signup'
                      ? t('auth.createAccount')
                      : mode === 'forgot-password'
                        ? t('auth.resetPassword')
                        : mode === 'verify-otp'
                          ? 'Verify your email'
                          : mode === 'reset-password'
                            ? t('auth.resetPassword')
                            : mode === 'twofactor-setup'
                              ? t('auth.setup2fa')
                              : mode === 'twofactor-verify'
                                ? t('auth.verify2fa')
                                : t('auth.secureAccount')}
                </h2>
                <p className="mt-1 text-center text-sm font-medium tracking-tight text-slate-600 lg:text-left">
                  {mode === 'signin'
                    ? selectedRole
                      ? t('auth.enterEmail')
                      : t('auth.chooseRole')
                    : mode === 'signup'
                      ? 'Create a student account to get started'
                      : mode === 'forgot-password'
                        ? 'Enter your email and we will send a reset code'
                        : mode === 'verify-otp'
                          ? 'Enter the code we sent to your inbox'
                          : mode === 'reset-password'
                            ? 'Choose a new password for your account'
                            : mode === 'twofactor-setup'
                              ? t('auth.scanQr')
                              : mode === 'twofactor-verify'
                                ? t('auth.enterCode')
                                : t('auth.continueVerify')}
                </p>
              </div>

              <div className="px-4 py-4 md:px-5">
          {/* Back button for non-signin modes */}
          {mode !== 'signin' && (
            <button
              onClick={() => {
                setMode('signin');
                setSelectedRole(null); // Reset role selection when going back
              }}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/60 px-2.5 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-800 hover:text-white md:justify-start"
            >
              <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="leading-tight">Back to Sign In</span>
            </button>
          )}
          
          {/* Back button for role selection in signin mode */}
          {mode === 'signin' && selectedRole && (
            <button
              onClick={() => setSelectedRole(null)}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/60 px-2.5 py-2 text-sm font-semibold tracking-tight text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-800 hover:text-white md:justify-start"
            >
              <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="leading-tight">Back to role selection</span>
            </button>
          )}

          {/* Message Display */}
          {message && (
            <div className={`mb-4 max-h-20 overflow-hidden p-3 rounded-xl border-2 ${
              message.type === 'success' 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 text-green-800 shadow-sm' 
                : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300 text-red-800 shadow-sm'
            }`}>
              <div className="flex items-start space-x-2">
                {message.type === 'success' ? (
                  <svg className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-xs font-medium leading-5 break-words">{message.text}</span>
              </div>
            </div>
          )}

          {/* Form Content */}
          {renderForm()}

          {/* Mode Switch Links */}
          {(mode === 'signin' && selectedRole === 'teacher') ||
          (mode === 'forgot-password' && !resetEmailSent) ||
          mode === 'signup' ? (
            <div className="mt-4 border-t border-slate-200/80 pt-4 text-center">
              {mode === 'signin' && selectedRole === 'teacher' && (
                <p className="text-sm font-medium leading-relaxed text-slate-500">
                  {t('auth.teacherCreated')}
                </p>
              )}
              {mode === 'forgot-password' && !resetEmailSent && (
                <p className="text-sm font-medium text-slate-600">
                  {t('auth.rememberPassword')}{' '}
                  <button
                    onClick={() => setMode('signin')}
                    className="font-semibold text-slate-900 underline underline-offset-2 transition hover:text-slate-700"
                  >
                    {t('auth.signIn')}
                  </button>
                </p>
              )}
              {mode === 'signup' && (
                <p className="text-sm font-medium text-slate-600">
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setMode('signin');
                      setSelectedRole(null);
                    }}
                    className="font-semibold text-slate-900 underline underline-offset-2 transition hover:text-slate-700"
                  >
                    {t('auth.signIn')}
                  </button>
                </p>
              )}
            </div>
          ) : null}

          {/* Features - displayed when showing role selection */}
          {mode === 'signin' && !selectedRole && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center">
              <span className="text-[11px] font-semibold tracking-tight text-slate-500">{t('auth.featureLearning')}</span>
              <span className="text-slate-300" aria-hidden>·</span>
              <span className="text-[11px] font-semibold tracking-tight text-slate-500">{t('auth.featureExercises')}</span>
              <span className="text-slate-300" aria-hidden>·</span>
              <span className="text-[11px] font-semibold tracking-tight text-slate-500">{t('auth.featureProgress')}</span>
              <span className="text-slate-300" aria-hidden>·</span>
              <span className="text-[11px] font-semibold tracking-tight text-slate-500">{t('auth.featureEthics')}</span>
            </div>
          )}
              </div>

              <div className="border-t border-slate-200/80 px-4 py-2.5 text-center text-[11px] font-medium leading-relaxed text-slate-500 md:px-5">
                <div>© Networks and AI for Learning (NAIL), The University of Hong Kong</div>
                <div className="mt-0.5">Contact: Mr Yuebo Yang (yueboy@hku.hk); Professor Shihui Feng (shihuife@hku.hk)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};