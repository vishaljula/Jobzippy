export function deriveVaultPassword(user: any | null): string {
  if (!user) {
    return 'jobzippy-demo';
  }
  const extensionId =
    typeof chrome !== 'undefined' && chrome?.runtime?.id ? chrome.runtime.id : 'jobzippy';

  // Handle different user object structures
  const userId = user.sub || user.id || user.email;

  if (!userId) {
    console.warn('[Vault] Could not derive user ID from user object', user);
    return 'jobzippy-demo';
  }

  return `vault-${extensionId}-${userId}`;
}
