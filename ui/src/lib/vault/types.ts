import type { ProfileVault } from '@/lib/types';
import { VAULT_STORES } from './constants';

export type VaultStore = keyof typeof VAULT_STORES;
export type VaultStoreKey = (typeof VAULT_STORES)[VaultStore];

export type VaultDataStore = Exclude<VaultStore, 'meta'>;
export type VaultDataStoreKey = Exclude<VaultStoreKey, typeof VAULT_STORES.meta>;

export type VaultValueMap = {
  [VAULT_STORES.profile]: ProfileVault['profile'];
  [VAULT_STORES.compliance]: ProfileVault['compliance'];
  [VAULT_STORES.history]: ProfileVault['history'];
  [VAULT_STORES.policies]: ProfileVault['policies'];
};

export type VaultValue<TStore extends VaultDataStoreKey> = VaultValueMap[TStore];

export interface EncryptedPayload {
  iv: string; // base64
  ciphertext: string; // base64
}

export interface VaultExportEnvelope {
  version: number;
  createdAt: string;
  salt: string; // base64
  stores: Partial<Record<VaultDataStoreKey, EncryptedPayload>>;
}

export interface DerivationArtifacts {
  key: CryptoKey;
  salt: Uint8Array;
}
