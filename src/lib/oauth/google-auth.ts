/**
 * Google OAuth Service
 * Handles OAuth 2.0 PKCE flow for Chrome extension
 */

import { GOOGLE_OAUTH_CONFIG } from '../config';
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce';
import type { OAuthTokens, UserInfo } from '../types';

const STORAGE_KEYS = {
  TOKENS: 'oauth_tokens',
  USER_INFO: 'user_info',
  CODE_VERIFIER: 'pkce_code_verifier',
  STATE: 'oauth_state',
} as const;

/**
 * Start OAuth flow with Google
 * @param includeGmailScope - Whether to request Gmail scope
 */
export async function startOAuthFlow(includeGmailScope = false): Promise<void> {
  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store code verifier and state for later verification
    await chrome.storage.local.set({
      [STORAGE_KEYS.CODE_VERIFIER]: codeVerifier,
      [STORAGE_KEYS.STATE]: state,
    });

    // Build scopes array
    const scopes: string[] = [...GOOGLE_OAUTH_CONFIG.requiredScopes];
    if (includeGmailScope) {
      scopes.push(...GOOGLE_OAUTH_CONFIG.optionalScopes);
    }

    // Build authorization URL
    const authParams = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      response_type: 'code',
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent screen to ensure refresh token
    });

    const authUrl = `${GOOGLE_OAUTH_CONFIG.authEndpoint}?${authParams.toString()}`;

    // Launch OAuth flow in a new window
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!redirectUrl) {
      throw new Error('No redirect URL received from auth flow');
    }

    // Extract authorization code from redirect URL
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Verify state to prevent CSRF
    const storedState = await chrome.storage.local.get(STORAGE_KEYS.STATE);
    if (returnedState !== storedState[STORAGE_KEYS.STATE]) {
      throw new Error('State mismatch - possible CSRF attack');
    }

    // Exchange code for tokens
    await exchangeCodeForTokens(code, codeVerifier);

    // Clean up temporary storage
    await chrome.storage.local.remove([STORAGE_KEYS.CODE_VERIFIER, STORAGE_KEYS.STATE]);
  } catch (error) {
    console.error('[OAuth] Error during auth flow:', error);
    throw error;
  }
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens> {
  const tokenParams = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CONFIG.clientId,
    code,
    code_verifier: codeVerifier, // PKCE replaces client_secret!
    grant_type: 'authorization_code',
    redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
  });

  const response = await fetch(GOOGLE_OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens: OAuthTokens = await response.json();

  // Calculate expiration timestamp
  tokens.expires_at = Date.now() + tokens.expires_in * 1000;

  // Store tokens securely
  await chrome.storage.local.set({
    [STORAGE_KEYS.TOKENS]: tokens,
  });

  // Fetch and store user info
  await fetchAndStoreUserInfo(tokens.access_token);

  return tokens;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<OAuthTokens> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TOKENS);
  const currentTokens: OAuthTokens | undefined = stored[STORAGE_KEYS.TOKENS];

  if (!currentTokens?.refresh_token) {
    throw new Error('No refresh token available');
  }

  const tokenParams = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CONFIG.clientId,
    refresh_token: currentTokens.refresh_token,
    grant_type: 'refresh_token',
    // Note: Refresh tokens don't require client_secret with PKCE
  });

  const response = await fetch(GOOGLE_OAUTH_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const newTokens: OAuthTokens = await response.json();

  // Preserve refresh token (not always returned on refresh)
  if (!newTokens.refresh_token && currentTokens.refresh_token) {
    newTokens.refresh_token = currentTokens.refresh_token;
  }

  // Calculate expiration timestamp
  newTokens.expires_at = Date.now() + newTokens.expires_in * 1000;

  // Store updated tokens
  await chrome.storage.local.set({
    [STORAGE_KEYS.TOKENS]: newTokens,
  });

  return newTokens;
}

/**
 * Get valid access token (refreshes if expired)
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TOKENS);
  const tokens: OAuthTokens | undefined = stored[STORAGE_KEYS.TOKENS];

  if (!tokens) {
    throw new Error('Not authenticated');
  }

  // Check if token is expired (with 5-minute buffer)
  const isExpired = tokens.expires_at ? tokens.expires_at < Date.now() + 5 * 60 * 1000 : true;

  if (isExpired && tokens.refresh_token) {
    console.log('[OAuth] Access token expired, refreshing...');
    const newTokens = await refreshAccessToken();
    return newTokens.access_token;
  }

  return tokens.access_token;
}

/**
 * Fetch user info from Google
 */
async function fetchAndStoreUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userInfo: UserInfo = await response.json();

  // Store user info
  await chrome.storage.local.set({
    [STORAGE_KEYS.USER_INFO]: userInfo,
  });

  return userInfo;
}

/**
 * Get stored user info
 */
export async function getUserInfo(): Promise<UserInfo | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.USER_INFO);
  return stored[STORAGE_KEYS.USER_INFO] || null;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TOKENS);
  return !!stored[STORAGE_KEYS.TOKENS];
}

/**
 * Logout user
 * Revokes tokens and clears storage
 */
export async function logout(): Promise<void> {
  try {
    // Get current tokens
    const stored = await chrome.storage.local.get(STORAGE_KEYS.TOKENS);
    const tokens: OAuthTokens | undefined = stored[STORAGE_KEYS.TOKENS];

    // Revoke access token if available
    if (tokens?.access_token) {
      await fetch(GOOGLE_OAUTH_CONFIG.revokeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `token=${tokens.access_token}`,
      });
    }
  } catch (error) {
    console.error('[OAuth] Error revoking token:', error);
    // Continue with logout even if revocation fails
  } finally {
    // Clear stored tokens and user info
    await chrome.storage.local.remove([STORAGE_KEYS.TOKENS, STORAGE_KEYS.USER_INFO]);
  }
}
