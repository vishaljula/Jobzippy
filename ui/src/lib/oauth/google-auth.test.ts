import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAuthenticated, getUserInfo, logout, getValidAccessToken } from './google-auth';
import type { OAuthTokens, UserInfo } from '../types';

// Mock chrome API
const mockChromeStorage = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  global.chrome = {
    storage: {
      local: mockChromeStorage,
    },
  } as unknown as typeof chrome;
});

describe('OAuth - isAuthenticated', () => {
  it('returns true when tokens exist', async () => {
    mockChromeStorage.get.mockResolvedValue({
      oauth_tokens: { access_token: 'test-token' },
    });

    const result = await isAuthenticated();
    expect(result).toBe(true);
  });

  it('returns false when no tokens exist', async () => {
    mockChromeStorage.get.mockResolvedValue({});

    const result = await isAuthenticated();
    expect(result).toBe(false);
  });
});

describe('OAuth - getUserInfo', () => {
  it('returns user info when stored', async () => {
    const userInfo: UserInfo = {
      sub: '123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/pic.jpg',
    };

    mockChromeStorage.get.mockResolvedValue({
      user_info: userInfo,
    });

    const result = await getUserInfo();
    expect(result).toEqual(userInfo);
  });

  it('returns null when no user info stored', async () => {
    mockChromeStorage.get.mockResolvedValue({});

    const result = await getUserInfo();
    expect(result).toBeNull();
  });
});

describe('OAuth - logout', () => {
  it('revokes token and clears storage', async () => {
    const tokens: OAuthTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email',
    };

    mockChromeStorage.get.mockResolvedValue({
      oauth_tokens: tokens,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    await logout();

    // Verify token revocation was attempted
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('revoke'),
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Verify storage was cleared
    expect(mockChromeStorage.remove).toHaveBeenCalledWith(['oauth_tokens', 'user_info']);
  });

  it('clears storage even if revocation fails', async () => {
    mockChromeStorage.get.mockResolvedValue({
      oauth_tokens: { access_token: 'test' },
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await logout();

    // Storage should still be cleared
    expect(mockChromeStorage.remove).toHaveBeenCalledWith(['oauth_tokens', 'user_info']);
  });
});

describe('OAuth - getValidAccessToken', () => {
  it('returns existing token if not expired', async () => {
    const futureTime = Date.now() + 60 * 60 * 1000; // 1 hour from now
    const tokens: OAuthTokens = {
      access_token: 'valid-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid',
      expires_at: futureTime,
    };

    mockChromeStorage.get.mockResolvedValue({
      oauth_tokens: tokens,
    });

    const token = await getValidAccessToken();
    expect(token).toBe('valid-token');
  });

  it('throws error if not authenticated', async () => {
    mockChromeStorage.get.mockResolvedValue({});

    await expect(getValidAccessToken()).rejects.toThrow('Not authenticated');
  });

  it('refreshes token if expired', async () => {
    const pastTime = Date.now() - 1000; // Expired
    const tokens: OAuthTokens = {
      access_token: 'expired-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid',
      expires_at: pastTime,
    };

    const newTokens: OAuthTokens = {
      access_token: 'new-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid',
    };

    mockChromeStorage.get.mockResolvedValue({ oauth_tokens: tokens });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => newTokens,
    });

    const token = await getValidAccessToken();
    expect(token).toBe('new-token');
    expect(mockChromeStorage.set).toHaveBeenCalled();
  });
});
