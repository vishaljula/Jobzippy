import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/lib/auth/AuthContext';
import App from './App';
import { isAuthenticated, getUserInfo } from '@/lib/oauth/google-auth';
import * as onboardingModule from '@/lib/onboarding';

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
    getStoredTokens: vi.fn(() =>
      Promise.resolve({
        access_token: 'mock-access',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'mock-id-token',
      })
    ),
  };
});

vi.mock('@/lib/firebase/session', () => ({
  connectFirebaseAuth: vi.fn(),
  disconnectFirebaseAuth: vi.fn(),
}));

const actualUseOnboarding = onboardingModule.useOnboarding;
const useOnboardingSpy = vi.spyOn(onboardingModule, 'useOnboarding');

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
    useOnboardingSpy.mockImplementation((enabled: boolean) => actualUseOnboarding(enabled));
    chrome.storage.local.get = vi.fn(
      async () => ({}) as Record<string, unknown>
    ) as unknown as typeof chrome.storage.local.get;
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
      expect(screen.getByText('Not signed in')).toBeInTheDocument();
    });
  });

  it('renders hero card in default view', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/welcome to jobzippy/i)).toBeInTheDocument();
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

  it('opens onboarding for a first-time user and allows reopening via nav icon', async () => {
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
    const storageGetMock = chrome.storage.local.get as unknown as Mock;
    storageGetMock.mockResolvedValue({
      onboardingStatus: undefined,
    });

    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByText(/finish setting up jobzippy/i)).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close onboarding wizard/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/finish setting up jobzippy/i)).not.toBeInTheDocument();
    });

    const navButton = await screen.findByRole('button', { name: /onboarding/i });
    await user.click(navButton);

    await waitFor(() => {
      expect(screen.getByText(/finish setting up jobzippy/i)).toBeInTheDocument();
    });

    isAuthenticatedMock.mockResolvedValue(false);
    storageGetMock.mockResolvedValue({});
  });

  it('shows resume onboarding card when onboarding was skipped', async () => {
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
    useOnboardingSpy.mockImplementation((enabled: boolean) => {
      const result = actualUseOnboarding(enabled);
      if (!enabled) {
        return result;
      }
      return {
        ...result,
        snapshot: { ...result.snapshot, status: 'skipped' },
      };
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByTestId('resume-onboarding-card')).toBeInTheDocument();
    });

    isAuthenticatedMock.mockResolvedValue(false);
  });
});
