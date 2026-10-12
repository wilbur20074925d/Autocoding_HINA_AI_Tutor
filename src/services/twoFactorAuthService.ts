import { TOTP, Secret } from 'otpauth';

/**
 * Service for handling Two-Factor Authentication using TOTP (Time-based One-Time Password)
 * This service generates secrets, creates QR codes, and verifies 6-digit codes
 */
export class TwoFactorAuthService {
  /**
   * Generate a new TOTP secret for a user/attendance session
   * @param userId - The user ID
   * @param lectureId - The lecture/attendance session ID
   * @param issuer - The issuer name (e.g., "TDG System")
   * @param label - The account label (e.g., user email or name)
   * @returns An object containing the secret and the otpauth URL for QR code generation
   */
  static generateSecret(
    userId: string,
    lectureId: string,
    issuer: string = 'TDG System',
    label: string = 'Attendance'
  ): { secret: string; otpauthUrl: string } {
    // Generate a unique secret for this attendance session using otpauth's Secret class
    const secret = new Secret();
    const secretString = secret.base32;
    
    // Verify the secret can be recreated (for debugging)
    try {
      const testSecret = Secret.fromBase32(secretString);
      console.log('[2FA] Secret generation test: OK, length:', secretString.length);
    } catch (error) {
      console.error('[2FA] Secret generation test FAILED:', error);
    }
    
    // Create TOTP instance
    const totp = new TOTP({
      issuer,
      label: `${label} (${lectureId.slice(0, 8)})`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    // Generate the otpauth URL for QR code
    const otpauthUrl = totp.toString();
    
    // Verify we can generate a code with the stored secret
    try {
      const testSecret = Secret.fromBase32(secretString);
      const testTotp = new TOTP({
        secret: testSecret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });
      const testCode = testTotp.generate();
      console.log('[2FA] Secret verification test: Generated code:', testCode);
    } catch (error) {
      console.error('[2FA] Secret verification test FAILED:', error);
    }

    return {
      secret: secretString,
      otpauthUrl,
    };
  }

  /**
   * Build an otpauth URL (for QR code) from an existing base32 secret.
   * This is used on subsequent logins so we can show the QR code again
   * without generating a new secret (keeps a single secret per account).
   */
  static buildOtpAuthUrlFromSecret(
    secretString: string,
    issuer: string,
    label: string
  ): string {
    try {
      const secret = Secret.fromBase32(secretString.trim());
      const totp = new TOTP({
        issuer,
        label,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });
      return totp.toString();
    } catch (error) {
      console.error('[2FA] Error building otpauth URL from existing secret:', error);
      return '';
    }
  }

  /**
   * Verify a 6-digit TOTP code against a secret
   * @param code - The 6-digit code entered by the user
   * @param secret - The secret (base32 string) to verify against
   * @param window - Time window tolerance (default: 2, meaning current, previous, and next period)
   * @returns true if code is valid, false otherwise
   */
  static verifyCode(code: string, secret: string, window: number = 2): boolean {
    try {
      // Remove any spaces or dashes from the code
      const cleanCode = code.replace(/\s|-/g, '');
      
      // Validate code format
      if (!/^\d{6}$/.test(cleanCode)) {
        console.log('[2FA] Invalid code format:', cleanCode);
        return false;
      }

      if (!secret || secret.trim() === '') {
        console.error('[2FA] Secret is empty or invalid');
        return false;
      }

      // Create Secret instance from base32 string
      let secretObj: Secret;
      try {
        secretObj = Secret.fromBase32(secret.trim());
      } catch (error) {
        console.error('[2FA] Error creating secret from base32:', error, 'Secret:', secret);
        return false;
      }

      // Create TOTP instance with the secret
      const totp = new TOTP({
        secret: secretObj,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      // Generate code for current time period
      const currentCode = totp.generate();
      console.log('[2FA] Current code:', currentCode, 'Entered code:', cleanCode);
      
      // Direct comparison first (most reliable)
      if (cleanCode === currentCode) {
        console.log('[2FA] Code matched (direct comparison)');
        return true;
      }
      
      // Try validate method with window tolerance
      try {
        const isValidValidate = totp.validate({ token: cleanCode, window });
        console.log('[2FA] Validate method result:', isValidValidate);
        
        if (isValidValidate) {
          return true;
        }
      } catch (validateError) {
        console.warn('[2FA] Validate method error:', validateError);
      }
      
      // Fallback: Generate codes for adjacent time periods manually
      // This handles cases where validate() doesn't work as expected
      const now = Math.floor(Date.now() / 1000);
      const period = 30;
      
      // Check previous and next periods
      for (let offset = -window; offset <= window; offset++) {
        if (offset === 0) continue; // Already checked current
        
        try {
          // Create a new TOTP instance with adjusted time
          const adjustedTotp = new TOTP({
            secret: secretObj,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
          });
          
          // Calculate timestamp for this period
          const timestamp = now + (offset * period);
          const expectedCode = adjustedTotp.generate({ timestamp } as any);
          
          if (cleanCode === expectedCode) {
            console.log('[2FA] Code matched with offset:', offset, 'Expected:', expectedCode, 'Entered:', cleanCode);
            return true;
          }
        } catch (error) {
          // Ignore errors for individual periods
        }
      }
      
      console.log('[2FA] Code verification failed. Entered:', cleanCode, 'Expected (current):', currentCode);
      return false;
    } catch (error) {
      console.error('[2FA] Error verifying TOTP code:', error);
      return false;
    }
  }

  /**
   * Get the current TOTP code for a secret (for testing/debugging)
   * @param secret - The secret (base32 string) to generate code for
   * @returns The current 6-digit code
   */
  static getCurrentCode(secret: string): string {
    try {
      const secretObj = Secret.fromBase32(secret);
      const totp = new TOTP({
        secret: secretObj,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });

      return totp.generate();
    } catch (error) {
      console.error('Error generating TOTP code:', error);
      return '';
    }
  }
}

