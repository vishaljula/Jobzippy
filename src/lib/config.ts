/**
 * Application Configuration
 * OAuth and API configuration
 */

// Google OAuth Configuration
export const GOOGLE_OAUTH_CONFIG = {
  // OAuth Client ID from Google Cloud Console
  // https://console.cloud.google.com/apis/credentials
  clientId:
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '230186995085-oalftgmm6bhncn6gorjfl6ricptculam.apps.googleusercontent.com',

  // OAuth endpoints
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revokeEndpoint: 'https://oauth2.googleapis.com/revoke',

  // Required scopes
  requiredScopes: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
  ],

  // Optional scopes (user can choose)
  optionalScopes: ['https://www.googleapis.com/auth/gmail.readonly'],

  // Redirect URI for Chrome extension
  // Format: https://<extension-id>.chromiumapp.org/
  get redirectUri() {
    const extensionId = chrome.runtime?.id || 'EXTENSION_ID';
    return `https://${extensionId}.chromiumapp.org/`;
  },
} as const;

// API Configuration
export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
} as const;

// App Configuration
export const APP_CONFIG = {
  name: 'Jobzippy',
  version: chrome.runtime?.getManifest().version || '0.1.0',
  environment: import.meta.env.MODE || 'development',
} as const;
