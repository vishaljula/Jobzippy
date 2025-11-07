import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Mock OAuth functions
vi.mock('../oauth/google-auth', () => ({
  startOAuthFlow: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: vi.fn().mockResolvedValue(false),
  getUserInfo: vi.fn().mockResolvedValue(null),
}));

// Test component that uses the hook
function TestComponent() {
  const { isAuthenticated, isLoading, user, error } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (isAuthenticated && user) return <div>Authenticated: {user.name}</div>;
  return <div>Not authenticated</div>;
}

describe('AuthContext', () => {
  it('provides auth state to children', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Should show loading initially
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    // Should show not authenticated after load
    await waitFor(() => {
      expect(screen.getByText(/not authenticated/i)).toBeInTheDocument();
    });
  });

  it('provides authenticated state when user is logged in', async () => {
    const { isAuthenticated, getUserInfo } = await import('../oauth/google-auth');

    vi.mocked(isAuthenticated).mockResolvedValue(true);
    vi.mocked(getUserInfo).mockResolvedValue({
      sub: '123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/pic.jpg',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/authenticated: test user/i)).toBeInTheDocument();
    });
  });

  it('throws error when useAuth used outside provider', () => {
    // Suppress error console log for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within AuthProvider');

    consoleSpy.mockRestore();
  });

  it('handles authentication errors gracefully', async () => {
    const { isAuthenticated } = await import('../oauth/google-auth');

    vi.mocked(isAuthenticated).mockRejectedValue(new Error('Auth check failed'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
      expect(screen.getByText(/auth check failed/i)).toBeInTheDocument();
    });
  });
});
