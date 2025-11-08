import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/lib/auth/AuthContext';
import App from './App';
import { isAuthenticated, getUserInfo } from '@/lib/oauth/google-auth';

vi.mock('@/lib/oauth/google-auth', () => {
  return {
    startOAuthFlow: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: vi.fn(() => Promise.resolve(false)),
    getUserInfo: vi.fn(() =>
      Promise.resolve({
        sub: '123',
        email: 'user@example.com',
        email_verified: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.png',
      })
    ),
  };
});

// Helper to render with AuthProvider
function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

describe('App', () => {
  beforeEach(() => {
    chrome.storage.local.get = vi.fn(() => Promise.resolve({}));
    chrome.storage.local.set = vi.fn(() => Promise.resolve());
  });

  it('shows loading state initially', () => {
    renderApp();
    expect(screen.getByText(/loading jobzippy/i)).toBeInTheDocument();
  });

  it('renders main content after loading', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/welcome to jobzippy/i)).toBeInTheDocument();
    });
  });

  it('displays the header with logo and status', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Jobzippy')).toBeInTheDocument();
      expect(screen.getByText('Your AI Job Assistant')).toBeInTheDocument();
      expect(screen.getByText('Not signed in')).toBeInTheDocument();
    });
  });

  it('renders all feature cards', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('Auto-Apply')).toBeInTheDocument();
      expect(screen.getByText('Track Applications')).toBeInTheDocument();
      expect(screen.getByText('Daily Updates')).toBeInTheDocument();
      expect(screen.getByText('Privacy First')).toBeInTheDocument();
    });
  });

  it('renders Sign in with Google button when not authenticated', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    });
  });

  it('displays version number in footer', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    });
  });

  it('opens onboarding wizard for first-time authenticated user', async () => {
    const isAuthenticatedMock = vi.mocked(isAuthenticated);
    const getUserInfoMock = vi.mocked(getUserInfo);

    isAuthenticatedMock.mockResolvedValue(true);
    getUserInfoMock.mockResolvedValue({
      sub: 'abc',
      email: 'first@jobzippy.ai',
      email_verified: true,
      name: 'First User',
      given_name: 'First',
      family_name: 'User',
      picture: 'https://example.com/avatar.png',
    });
    const storageGetMock = vi.mocked(chrome.storage.local.get);
    storageGetMock.mockResolvedValue({
      onboardingStatus: undefined,
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/step 1 of/i)).toBeInTheDocument();
      expect(screen.getByText(/welcome to jobzippy/i)).toBeInTheDocument();
    });

    isAuthenticatedMock.mockResolvedValue(false);
    storageGetMock.mockResolvedValue({});
  });

  it('shows resume onboarding card when onboarding was skipped', async () => {
    const isAuthenticatedMock = vi.mocked(isAuthenticated);
    const getUserInfoMock = vi.mocked(getUserInfo);
    const storageGetMock = vi.mocked(chrome.storage.local.get);

    isAuthenticatedMock.mockResolvedValue(true);
    getUserInfoMock.mockResolvedValue({
      sub: 'abc',
      email: 'first@jobzippy.ai',
      email_verified: true,
      name: 'First User',
      given_name: 'First',
      family_name: 'User',
      picture: 'https://example.com/avatar.png',
    });
    storageGetMock.mockResolvedValue({
      onboardingStatus: { status: 'skipped', updatedAt: new Date().toISOString() },
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /complete setup/i })).toBeInTheDocument();
    });

    isAuthenticatedMock.mockResolvedValue(false);
    storageGetMock.mockResolvedValue({});
  });
});
