import { supabase } from '../lib/supabase';
import type { User } from '../lib/supabase';

// Token / auth utilities
const TOKEN_KEY = 'eduai_auth_token';
const USER_KEY = 'eduai_user_data';
const REFRESH_TOKEN_KEY = 'eduai_refresh_token';
const CURRENT_VIEW_KEY = 'eduai_current_view';
const APP_STATE_KEY = 'eduai_app_state';
// Local flag used to ensure 2FA verification has happened on this device for the current user
const TWOFA_VERIFIED_KEY = 'eduai_twofa_verified';

export interface SignUpData {
  email: string;
  password: string;
  name: string;
  role: 'student' | 'teacher';
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AppState {
  currentView: string;
  selectedExerciseId?: string;
  selectedCourseId?: string;
  selectedStudentId?: string;
  selectedModuleId?: string;
  courseActiveTab?: string;
}
export class AuthService {
  // Sign up with email and password
  static async signUp(data: SignUpData) {
    try {
      // Check if Supabase is available
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            role: data.role,
          }
        }
      });

      if (error) {
        if (error.message.includes('fetch')) {
          throw new Error('Unable to connect to authentication service. Please check your internet connection and try again.');
        }
        throw error;
      }

      // Store tokens if user is created
      if (authData.session) {
        this.storeTokens(authData.session);
      }

      return { user: authData.user, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { user: null, error: error as Error };
    }
  }

  // Sign in with email and password
  static async signIn(data: SignInData) {
    try {
      // Check if Supabase is available
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        // Provide more specific error messages
        if (error.message === 'Invalid login credentials') {
          throw new Error('Invalid email or password. Please check your credentials and try again. If you recently signed up, please verify your email address first.');
        }
        if (error.message.includes('fetch')) {
          throw new Error('Unable to connect to authentication service. Please check your internet connection and try again.');
        }
        throw new Error(error.message || 'An error occurred during sign in');
      }

      // Store tokens and user data
      if (authData.session) {
        this.storeTokens(authData.session);
      }

      // Get user profile data
      if (authData.user) {
        const userData = await this.getUserProfile(authData.user.id);
        if (userData) {
          this.storeUserData(userData);
        }
        return { user: userData, error: null };
      }

      return { user: null, error: new Error('No user data returned') };
    } catch (error) {
      console.error('Sign in error:', error);
      return { user: null, error: error as Error };
    }
  }

  /**
   * Enable two-factor authentication for a user by storing the TOTP secret.
   * This should be called only after the user has successfully signed in.
   * The secret itself is stored only in the database, not in local storage.
   */
  static async enableTwoFactorForUser(userId: string, secret: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          twofa_secret: secret,
          twofa_enabled: true,
          twofa_enrolled_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select('twofa_enabled, twofa_enrolled_at')
        .single();

      if (error) {
        throw error;
      }

      // Update cached user data if present (status only, not the secret)
      const storedUser = this.getStoredUserData();
      if (storedUser && storedUser.id === userId) {
        const updatedUser = {
          ...storedUser,
          twofa_enabled: data.twofa_enabled ?? true,
          twofa_enrolled_at: data.twofa_enrolled_at ?? new Date().toISOString()
        } as User;
        this.storeUserData(updatedUser);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Enable two-factor auth error:', error);
      return { success: false, error: error as Error };
    }
  }

  /**
   * Fetch the two-factor secret for the currently signed-in user.
   * This is used during the login 2FA step to verify the code the user enters.
   * NOTE: This exposes the secret to the frontend and should not be used in
   * high-security production environments. It is acceptable for this
   * educational/demo application.
   */
  static async getTwoFactorSecret(userId: string): Promise<string | null> {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase
        .from('users')
        .select('twofa_secret')
        .eq('id', userId)
        .maybeSingle() as unknown as { data: { twofa_secret: string | null } | null; error: any };

      if (error) {
        throw error;
      }

      return data?.twofa_secret ?? null;
    } catch (error) {
      console.error('Get two-factor secret error:', error);
      return null;
    }
  }

  /**
   * Reset two-factor authentication for a user.
   * This clears the stored secret and disables 2FA, forcing re-enrollment on next login.
   * Intended for self-service reset (current user) or admin tooling.
   */
  static async resetTwoFactorForUser(userId: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase
        .from('users')
        .update({
          twofa_secret: null,
          twofa_enabled: false,
          twofa_enrolled_at: null
        })
        .eq('id', userId)
        .select('twofa_enabled, twofa_enrolled_at')
        .single() as unknown as { data: { twofa_enabled?: boolean; twofa_enrolled_at?: string | null } | null; error: any };

      if (error) {
        throw error;
      }

      // Update cached user data if present
      const storedUser = this.getStoredUserData();
      if (storedUser && storedUser.id === userId && data) {
        const updatedUser: User = {
          ...storedUser,
          twofa_enabled: data.twofa_enabled ?? false,
          twofa_enrolled_at: data.twofa_enrolled_at ?? null
        };
        this.storeUserData(updatedUser);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Reset two-factor auth error:', error);
      return { success: false, error: error as Error };
    }
  }

  // Sign in with Google
  static async signInWithGoogle() {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error) {
      console.error('Google sign in error:', error);
      return { data: null, error: error as Error };
    }
  }

  // Sign in with GitHub
  static async signInWithGitHub() {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/`,
        }
      });

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error) {
      console.error('GitHub sign in error:', error);
      return { data: null, error: error as Error };
    }
  }

  // Sign out
  static async signOut() {
    try {
      // Clear stored tokens and user data
      this.clearStoredData();
      
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase sign out error:', error);
          // Don't throw error here as we've already cleared local data
        }
      }
      
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      // Even if sign out fails, clear local data
      this.clearStoredData();
      return { error: error as Error };
    }
  }

  // Request password reset OTP (6-digit code)
  static async requestPasswordResetOTP(email: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      // Call the Supabase Edge Function to send OTP
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/send-otp-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to send OTP' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      return { success: true, message: data?.message || 'OTP sent successfully', error: null };
    } catch (error) {
      console.error('Request password reset OTP error:', error);
      return { success: false, message: null, error: error as Error };
    }
  }

  // Verify OTP code (check only, doesn't mark as used - for UI validation)
  static async verifyPasswordResetOTP(email: string, otpCode: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      // Check OTP using database function (doesn't mark as used)
      const { data, error } = await supabase.rpc('check_password_reset_otp', {
        user_email: email,
        code: otpCode,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Invalid or expired OTP code');
      }

      return { verified: true, error: null };
    } catch (error) {
      console.error('Verify OTP error:', error);
      return { verified: false, error: error as Error };
    }
  }

  // Reset password (legacy method - kept for backward compatibility)
  static async resetPassword(email: string) {
    // Redirect to new OTP-based flow
    return this.requestPasswordResetOTP(email);
  }

  // Update password (requires authentication)
  static async updatePassword(newPassword: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      return { error: null };
    } catch (error) {
      console.error('Update password error:', error);
      return { error: error as Error };
    }
  }

  // Reset password with OTP verification (for unauthenticated users)
  // This requires a Supabase Edge Function with admin access
  // Note: The edge function verifies the OTP, so we don't need to verify it here again
  static async resetPasswordWithOTP(email: string, otpCode: string, newPassword: string) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      // Call Edge Function to reset password (edge function will verify OTP and mark as used)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/reset-password-with-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ 
          email, 
          otp_code: otpCode,
          new_password: newPassword 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to reset password' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      return { error: null };
    } catch (error) {
      console.error('Reset password with OTP error:', error);
      return { error: error as Error };
    }
  }

  // Safe helper to get authenticated user from Supabase
  // This handles session restoration properly and avoids "Auth session missing" errors
  static async getAuthenticatedUser(): Promise<{ id: string; email?: string } | null> {
    console.log('[AuthService] getAuthenticatedUser() called');
    
    if (!supabase) {
      console.error('[AuthService] ❌ Supabase not configured');
      return null;
    }

    try {
      // First try to get session (this restores session from storage)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[AuthService] ❌ Session retrieval error:', {
          error: sessionError.message,
          code: sessionError.status,
        });
      }

      // If we have a session, use the user from it
      if (sessionData.session?.user) {
        console.log('[AuthService] ✅ Using user from session:', sessionData.session.user.id);
        return {
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
        };
      }

      // Try to refresh session if we have a refresh token
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        console.log('[AuthService] No session found, attempting refresh...');
        const refreshResult = await this.refreshTokenIfNeeded();
        
        if (refreshResult) {
          const { data: refreshedSessionData } = await supabase.auth.getSession();
          if (refreshedSessionData.session?.user) {
            console.log('[AuthService] ✅ Session refreshed, using user:', refreshedSessionData.session.user.id);
            return {
              id: refreshedSessionData.session.user.id,
              email: refreshedSessionData.session.user.email,
            };
          }
        }
      }

      // Last resort: try getUser() - but catch the error gracefully
      console.log('[AuthService] Attempting getUser() as last resort...');
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('[AuthService] ❌ getUser() error:', {
          error: error.message,
          code: error.status,
        });
        return null;
      }

      if (user) {
        console.log('[AuthService] ✅ User retrieved from getUser():', user.id);
        return {
          id: user.id,
          email: user.email,
        };
      }

      return null;
    } catch (error) {
      console.error('[AuthService] ❌ getAuthenticatedUser exception:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // Get current user
  static async getCurrentUser(): Promise<User | null> {
    console.log('[AuthService] getCurrentUser() called');
    try {
      // First try to get user from stored data
      const storedUser = this.getStoredUserData();
      const storedToken = this.getStoredToken();
      
      console.log('[AuthService] Stored data check:', {
        hasStoredUser: !!storedUser,
        hasStoredToken: !!storedToken,
        tokenValid: storedToken ? this.isTokenValid(storedToken) : false,
      });
      
      if (storedUser && storedToken && this.isTokenValid(storedToken)) {
        console.log('[AuthService] ✅ Using stored user data:', storedUser.id);
        return storedUser;
      }

      // Check if Supabase is available
      if (!supabase) {
        console.error('[AuthService] ❌ Supabase not configured, returning null user');
        return null;
      }

      console.log('[AuthService] Attempting to get user from Supabase...');
      
      // First try to get session (this restores session from storage)
      console.log('[AuthService] Getting session...');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[AuthService] ❌ Session retrieval error:', {
          error: sessionError.message,
          code: sessionError.status,
          details: sessionError,
        });
      } else {
      const expiresAt = sessionData.session?.expires_at;
      console.log('[AuthService] Session check:', {
        hasSession: !!sessionData.session,
        userId: sessionData.session?.user?.id || 'none',
        expiresAt: expiresAt || 'none',
        expiresIn: typeof expiresAt === 'number'
          ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000))
          : 'N/A',
      });
      }

      // If we have a session, use it directly
      if (sessionData.session?.user) {
        console.log('[AuthService] ✅ Found session, using user from session:', sessionData.session.user.id);
        
        // Store the session tokens
        this.storeTokens(sessionData.session);
        
        // Fetch user profile
        console.log('[AuthService] Fetching user profile from database...');
        const userProfile = await this.getUserProfile(sessionData.session.user.id);
        if (userProfile) {
          console.log('[AuthService] ✅ User profile retrieved:', userProfile.id);
          this.storeUserData(userProfile);
          return userProfile;
        } else {
          // User profile not found - this is expected for users that exist in auth but not in users table
          return null;
        }
      }

      // No session found, try to refresh if we have a refresh token
      console.log('[AuthService] No session found, checking for refresh token...');
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      
      if (refreshToken) {
        console.log('[AuthService] Found refresh token, attempting to refresh session...');
        const refreshResult = await this.refreshTokenIfNeeded();
        
        if (refreshResult) {
          // Session refreshed, try getting session again
          console.log('[AuthService] Session refreshed, getting session again...');
          const { data: refreshedSessionData, error: refreshedSessionError } = await supabase.auth.getSession();
          
          if (!refreshedSessionError && refreshedSessionData.session?.user) {
            console.log('[AuthService] ✅ Session refreshed successfully, using user:', refreshedSessionData.session.user.id);
            this.storeTokens(refreshedSessionData.session);
            
            const userProfile = await this.getUserProfile(refreshedSessionData.session.user.id);
            if (userProfile) {
              this.storeUserData(userProfile);
              return userProfile;
            }
          }
        }
      }

      // No session found and refresh failed - user is not authenticated
      console.warn('[AuthService] ⚠️ No valid session found after all attempts, clearing stored data');
      this.clearStoredData();
      return null;
    } catch (error) {
      console.error('[AuthService] ❌ Get current user exception:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Clear any cached session data on error
      this.clearStoredData();
      if (supabase) {
        try {
          await supabase.auth.signOut();
          console.log('[AuthService] Signed out after error');
        } catch (signOutError) {
          console.error('[AuthService] Error signing out:', signOutError);
        }
      }
      return null;
    }
  }

  // Token management methods
  private static storeTokens(session: any) {
    try {
      if (session.access_token) {
        localStorage.setItem(TOKEN_KEY, session.access_token);
      }
      if (session.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
      }
    } catch (error) {
      console.error('Error storing tokens:', error);
    }
  }

  private static storeUserData(user: User) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Error storing user data:', error);
    }
  }

  private static getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('Error getting stored token:', error);
      return null;
    }
  }

  private static getStoredUserData(): User | null {
    try {
      const userData = localStorage.getItem(USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting stored user data:', error);
      return null;
    }
  }

  private static isTokenValid(token: string): boolean {
    try {
      // Basic JWT token validation
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch (error) {
      console.error('Error validating token:', error);
      return false;
    }
  }

  // Local 2FA verification helpers (per device)
  static markTwoFactorVerified(userId: string) {
    try {
      localStorage.setItem(TWOFA_VERIFIED_KEY, userId);
    } catch (error) {
      console.error('Error marking 2FA verified:', error);
    }
  }

  static clearTwoFactorVerification() {
    try {
      localStorage.removeItem(TWOFA_VERIFIED_KEY);
    } catch (error) {
      console.error('Error clearing 2FA verification flag:', error);
    }
  }

  private static clearStoredData() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(CURRENT_VIEW_KEY);
      localStorage.removeItem(APP_STATE_KEY);
      localStorage.removeItem(TWOFA_VERIFIED_KEY);
      // Also clear any Supabase-related items
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Error clearing stored data:', error);
    }
  }

  // Refresh token if needed
  private static async refreshTokenIfNeeded(): Promise<boolean> {
    console.log('[AuthService] refreshTokenIfNeeded() called');
    try {
      if (!supabase) {
        console.error('[AuthService] ❌ Cannot refresh token - Supabase not configured');
        return false;
      }

      // First check if Supabase has a session stored
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        console.log('[AuthService] ✅ Session already exists, no refresh needed');
        this.storeTokens(sessionData.session);
        return true;
      }

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        console.warn('[AuthService] ⚠️ No refresh token found in storage');
        return false;
      }

      console.log('[AuthService] Attempting to refresh session with refresh token...');
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken
      });

      if (error) {
        console.error('[AuthService] ❌ Token refresh error:', {
          error: error.message,
          code: error.status,
          details: error,
        });
        this.clearStoredData();
        return false;
      }

      if (!data.session) {
        console.error('[AuthService] ❌ Token refresh returned no session');
        this.clearStoredData();
        return false;
      }

      const refreshedExpiresAt: number | undefined = (data.session as any).expires_at;
      console.log('[AuthService] ✅ Token refreshed successfully:', {
        userId: data.session.user?.id,
        expiresAt: refreshedExpiresAt,
        expiresIn: typeof refreshedExpiresAt === 'number'
          ? Math.max(0, refreshedExpiresAt - Math.floor(Date.now() / 1000))
          : 'N/A',
      });
      this.storeTokens(data.session);
      return true;
    } catch (error) {
      console.error('[AuthService] ❌ Token refresh exception:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.clearStoredData();
      return false;
    }
  }

  // Get user profile from database
  static async getUserProfile(userId: string): Promise<User | null> {
    console.log('[AuthService] getUserProfile() called for userId:', userId);
    try {
      if (!supabase) {
        console.error('[AuthService] ❌ Supabase not configured');
        return null;
      }

      console.log('[AuthService] Querying users table for userId:', userId);
      
      // Add timeout to prevent hanging
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout after 10 seconds')), 10000);
      });
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as {
        data: any;
        error: any;
      };

      if (error) {
        console.error('[AuthService] ❌ Error fetching user profile from database:', {
          error: error.message,
          code: error.code,
          details: error,
          hint: error.hint,
        });
        
        // If it's a timeout or network error, try to use auth metadata
        if (error.message.includes('timeout') || error.message.includes('network') || error.message.includes('fetch')) {
          console.warn('[AuthService] ⚠️ Database query timed out or network error, falling back to auth metadata');
        }
        
        // If user profile doesn't exist, try to get from auth metadata
        console.log('[AuthService] Attempting to get user from auth metadata...');
        const authUser = supabase ? await this.getAuthenticatedUser() : null;
        
        if (!authUser) {
          console.error('[AuthService] ❌ Error getting user from auth');
          return null;
        }
        
        if (authUser.id === userId) {
          // Get full user data from session
          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData.session?.user;
          
          if (user) {
            const metadata = user.user_metadata;
            const userData: User = {
              id: user.id,
              name: metadata.name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: metadata.role || 'student',
              avatar_url: metadata.avatar_url,
              created_at: user.created_at,
              updated_at: user.updated_at || user.created_at,
              twofa_enabled: false,
              twofa_enrolled_at: null
            };
            console.log('[AuthService] ✅ Created user from auth metadata:', userData.id);
            this.storeUserData(userData);
            return userData;
          }
        }
        return null;
      }

      if (!data) {
        // User profile doesn't exist in database, try to get from auth metadata
        // This is expected for users that exist in auth but haven't been created in users table yet
        const authUser = await this.getAuthenticatedUser();
        
        if (!authUser) {
          console.error('[AuthService] ❌ Error getting user from auth');
          return null;
        }
        
        if (authUser.id === userId) {
          // Get full user data from session
          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData.session?.user;
          
          if (user) {
            const metadata = user.user_metadata;
            const userData: User = {
              id: user.id,
              name: metadata.name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: metadata.role || 'student',
              avatar_url: metadata.avatar_url,
              created_at: user.created_at,
              updated_at: user.updated_at || user.created_at,
              twofa_enabled: false,
              twofa_enrolled_at: null
            };
            console.log('[AuthService] ✅ Created user from auth metadata:', userData.id);
            this.storeUserData(userData);
            return userData;
          }
        }
        console.warn('[AuthService] ⚠️ Auth user ID mismatch or not found');
        return null;
      }
      
      const row: any = data as any;
      console.log('[AuthService] ✅ User profile found in database:', row.id);
      const userData: User = {
        id: String(row.id),
        name: String(row.name),
        email: '', // Email comes from auth.users, not our users table
        role: (row.role as 'student' | 'teacher') ?? 'student',
        avatar_url: row.avatar_url ?? undefined,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at ?? row.created_at),
        enrolled_course_ids: Array.isArray(row.enrolled_course_ids) ? row.enrolled_course_ids : [],
        twofa_enabled: (row.twofa_enabled as boolean | undefined) ?? false,
        twofa_enrolled_at: (row.twofa_enrolled_at as string | null | undefined) ?? null
      };
      this.storeUserData(userData);
      return userData;
    } catch (error) {
      console.error('[AuthService] ❌ Get user profile exception:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // If it's a timeout, try to get user from auth metadata as fallback
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log('[AuthService] Attempting to get user from auth metadata after timeout...');
        if (!supabase) {
          return null;
        }
        const authUser = await this.getAuthenticatedUser();
        
        if (authUser && authUser.id === userId) {
          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData.session?.user;
          
          if (user) {
            const metadata = user.user_metadata;
            const userData: User = {
              id: user.id,
              name: metadata.name || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: metadata.role || 'student',
              avatar_url: metadata.avatar_url,
              created_at: user.created_at,
              updated_at: user.updated_at || user.created_at,
              twofa_enabled: false,
              twofa_enrolled_at: null
            };
            console.log('[AuthService] ✅ Created user from auth metadata after timeout:', userData.id);
            this.storeUserData(userData);
            return userData;
          }
        }
      }
      
      return null;
    }
  }

  // App state management methods
  static storeAppState(state: AppState) {
    try {
      localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
      localStorage.setItem(CURRENT_VIEW_KEY, state.currentView);
    } catch (error) {
      console.error('Error storing app state:', error);
    }
  }

  static getStoredAppState(): AppState | null {
    try {
      const stateData = localStorage.getItem(APP_STATE_KEY);
      return stateData ? JSON.parse(stateData) : null;
    } catch (error) {
      console.error('Error getting stored app state:', error);
      return null;
    }
  }

  static getStoredCurrentView(): string | null {
    try {
      return localStorage.getItem(CURRENT_VIEW_KEY);
    } catch (error) {
      console.error('Error getting stored current view:', error);
      return null;
    }
  }

  static clearAppState() {
    try {
      localStorage.removeItem(CURRENT_VIEW_KEY);
      localStorage.removeItem(APP_STATE_KEY);
    } catch (error) {
      console.error('Error clearing app state:', error);
    }
  }
  // Update user profile
  static async updateUserProfile(userId: string, updates: Partial<Pick<User, 'name' | 'role' | 'avatar_url'>>) {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set up your Supabase project first.');
      }

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update stored user data
      const storedUser = this.getStoredUserData();
      if (storedUser) {
        const updatedUser = { ...storedUser, ...updates };
        this.storeUserData(updatedUser);
      }

      return { user: data, error: null };
    } catch (error) {
      console.error('Update user profile error:', error);
      return { user: null, error: error as Error };
    }
  }

  // Listen to auth state changes
  static onAuthStateChange(callback: (user: User | null) => void) {
    console.log('[AuthService] Setting up auth state change listener...');
    if (!supabase) {
      console.error('[AuthService] ❌ Supabase not configured, auth state changes not available');
      return { data: { subscription: null } };
    }
    
    console.log('[AuthService] ✅ Auth state change listener registered');
    return supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthService] 🔔 Auth state change event:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id || 'none',
        expiresAt: session?.expires_at || 'none',
      });
      
      if (event === 'SIGNED_OUT') {
        console.log('[AuthService] User signed out, clearing stored data');
        this.clearStoredData();
        callback(null);
        return;
      }
      
      if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[AuthService] ✅ Token refreshed via auth state change:', {
          userId: session.user?.id,
          expiresAt: session.expires_at,
        });
        this.storeTokens(session);
      }
      
      if (event === 'SIGNED_IN' && session) {
        console.log('[AuthService] ✅ User signed in:', {
          userId: session.user?.id,
          email: session.user?.email,
        });
      }
      
      if (session?.user) {
        // Store new session tokens
        this.storeTokens(session);
        
        console.log('[AuthService] Fetching user profile for auth state change...');
        // Use setTimeout to make profile fetching non-blocking
        setTimeout(async () => {
          try {
            const userData = await this.getUserProfile(session.user.id);
            if (userData) {
              console.log('[AuthService] ✅ User profile loaded:', userData.id);
              this.storeUserData(userData);
              callback(userData);
            } else {
              console.warn('[AuthService] ⚠️ Failed to load user profile');
              // Still callback with null to indicate auth state changed
              callback(null);
            }
          } catch (error) {
            console.error('[AuthService] ❌ Error loading user profile in auth state change:', error);
            callback(null);
          }
        }, 0);
      } else {
        console.warn('[AuthService] ⚠️ No session in auth state change, clearing data');
        this.clearStoredData();
        callback(null);
      }
    });
  }

  // Initialize authentication state from stored data
  static initializeFromStorage(): User | null {
    console.log('[AuthService] initializeFromStorage() called');
    try {
      const storedUser = this.getStoredUserData();
      const storedToken = this.getStoredToken();
      
      console.log('[AuthService] Storage initialization check:', {
        hasStoredUser: !!storedUser,
        hasStoredToken: !!storedToken,
        tokenValid: storedToken ? this.isTokenValid(storedToken) : false,
        userId: storedUser?.id || 'none',
      });
      
      if (storedUser && storedToken && this.isTokenValid(storedToken)) {
        console.log('[AuthService] ✅ Initialized from storage:', storedUser.id);
        return storedUser;
      }
      
      // Token is invalid or missing, clear stored data
      console.warn('[AuthService] ⚠️ Invalid or missing token, clearing stored data');
      this.clearStoredData();
      return null;
    } catch (error) {
      console.error('[AuthService] ❌ Error initializing from storage:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.clearStoredData();
      return null;
    }
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    const token = this.getStoredToken();
    return token !== null && this.isTokenValid(token);
  }

  /**
   * Returns true only when the user has a valid token AND
   * this device has completed the 2FA step for this user at least once.
   * This forces 2FA even on the first login.
   * Students are exempt from 2FA requirement.
   */
  static isFullyAuthenticated(): boolean {
    const token = this.getStoredToken();
    if (!token || !this.isTokenValid(token)) {
      return false;
    }

    const user = this.getStoredUserData();
    if (!user) {
      return false;
    }

    // Students don't need 2FA verification
    if (user.role === 'student') {
      return true;
    }

    // Teachers must complete 2FA verification
    try {
      const verifiedForUser = localStorage.getItem(TWOFA_VERIFIED_KEY);
      return verifiedForUser === user.id;
    } catch (error) {
      console.error('Error checking 2FA verification flag:', error);
      return false;
    }
  }
}