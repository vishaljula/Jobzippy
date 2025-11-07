/**
 * Sign In with Google Component
 * Google-branded sign-in button following Google's brand guidelines
 */

import { useState } from 'react';
import { Button } from './ui/button';
import { useAuth } from '@/lib/auth/AuthContext';
import { toast } from 'sonner';

interface SignInWithGoogleProps {
  includeGmailScope?: boolean;
}

export function SignInWithGoogle({ includeGmailScope = false }: SignInWithGoogleProps) {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      await login(includeGmailScope);
      toast.success('Successfully signed in!');
    } catch (error) {
      console.error('[SignIn] Error:', error);
      toast.error('Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      disabled={isLoading}
      size="lg"
      className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 shadow-sm gap-3"
    >
      {/* Google Logo SVG */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z"
          fill="#4285F4"
        />
        <path
          d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
          fill="#34A853"
        />
        <path
          d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
          fill="#FBBC05"
        />
        <path
          d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
          fill="#EA4335"
        />
      </svg>

      {isLoading ? 'Signing in...' : 'Sign in with Google'}
    </Button>
  );
}

/**
 * Consent message for Gmail scope
 */
export function GmailConsentMessage() {
  return (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-sm text-gray-700 leading-relaxed">
        <strong>Email Sync (Optional):</strong> Jobzippy can read <strong>metadata only</strong>{' '}
        (From/Subject/Date) from a <strong>Gmail label you choose</strong> (e.g.,
        Jobzippy/Recruiters) to update your application status when recruiters reply. Jobzippy{' '}
        <strong>does not</strong> read or store email bodies or your other labels.
      </p>
    </div>
  );
}
