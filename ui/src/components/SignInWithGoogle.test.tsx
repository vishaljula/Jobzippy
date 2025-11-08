import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInWithGoogle, GmailConsentMessage } from './SignInWithGoogle';
import { AuthProvider } from '@/lib/auth/AuthContext';

// Mock the OAuth functions
vi.mock('@/lib/oauth/google-auth', () => ({
  startOAuthFlow: vi.fn(),
  isAuthenticated: vi.fn().mockResolvedValue(false),
  getUserInfo: vi.fn().mockResolvedValue(null),
  logout: vi.fn(),
}));

describe('SignInWithGoogle', () => {
  it('renders Sign in with Google button', () => {
    render(
      <AuthProvider>
        <SignInWithGoogle />
      </AuthProvider>
    );

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('displays Google logo', () => {
    render(
      <AuthProvider>
        <SignInWithGoogle />
      </AuthProvider>
    );

    const button = screen.getByRole('button');
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows loading state when signing in', async () => {
    const { startOAuthFlow } = await import('@/lib/oauth/google-auth');
    vi.mocked(startOAuthFlow).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <SignInWithGoogle />
      </AuthProvider>
    );

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
  });

  it('can include Gmail scope', async () => {
    render(
      <AuthProvider>
        <SignInWithGoogle includeGmailScope={true} />
      </AuthProvider>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

describe('GmailConsentMessage', () => {
  it('renders consent message', () => {
    render(<GmailConsentMessage />);

    expect(screen.getByText(/email sync/i)).toBeInTheDocument();
    expect(screen.getByText(/metadata only/i)).toBeInTheDocument();
  });

  it('explains what data is accessed', () => {
    render(<GmailConsentMessage />);

    expect(screen.getByText(/does not/i)).toBeInTheDocument();
    expect(screen.getByText(/email bodies/i)).toBeInTheDocument();
  });

  it('has blue info box styling', () => {
    const { container } = render(<GmailConsentMessage />);

    const box = container.querySelector('.bg-blue-50');
    expect(box).toBeInTheDocument();
  });
});
