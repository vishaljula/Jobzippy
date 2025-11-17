import type { UserInfo } from '@/lib/types';

export function deriveVaultPassword(user: UserInfo | null): string {
  if (!user) {
    return 'jobzippy-demo';
  }
  const extensionId =
    typeof chrome !== 'undefined' && chrome?.runtime?.id ? chrome.runtime.id : 'jobzippy';
  return `vault-${extensionId}-${user.sub}`;
}
