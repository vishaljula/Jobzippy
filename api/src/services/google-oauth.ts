import { fetch } from 'undici';

import { config } from '../config.js';
import type { OAuthExchangeInput } from '../schemas/oauth.js';

type GoogleTokenSuccess = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

type GoogleTokenError = {
  error: string;
  error_description?: string;
};

export class GoogleOAuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

export async function exchangeAuthorizationCode(
  payload: OAuthExchangeInput,
): Promise<GoogleTokenSuccess> {
  return fetchGoogleTokens({
    grant_type: 'authorization_code',
    code: payload.code,
    code_verifier: payload.code_verifier,
    redirect_uri: payload.redirect_uri,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenSuccess> {
  return fetchGoogleTokens({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

async function fetchGoogleTokens(parameters: Record<string, string>): Promise<GoogleTokenSuccess> {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    ...parameters,
  });

  const response = await fetch(config.google.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = (await response.json()) as GoogleTokenSuccess | GoogleTokenError;

  if (!response.ok) {
    const errorMessage =
      'error' in data
        ? `${data.error}${data.error_description ? `: ${data.error_description}` : ''}`
        : 'Unknown error from Google OAuth';
    throw new GoogleOAuthError(response.status, errorMessage);
  }

  return data as GoogleTokenSuccess;
}

