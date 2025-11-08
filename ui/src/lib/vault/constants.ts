export const VAULT_DB_NAME = 'JobzippyVault';
export const VAULT_DB_VERSION = 1;

export const VAULT_STORES = {
  profile: 'profile',
  compliance: 'compliance',
  history: 'history',
  policies: 'policies',
  meta: 'meta',
} as const;

export const SALT_KEY = 'vault_salt';
export const EXPORT_VERSION = 1;

export const PBKDF2_ITERATIONS = 250000;
export const PBKDF2_HASH = 'SHA-256';
export const PBKDF2_KEY_LENGTH = 256;

export const AES_ALGORITHM = 'AES-GCM';
export const AES_KEY_LENGTH = 256;
export const AES_IV_LENGTH = 12; // 96 bits recommended for GCM
