import {
  decodeBase64,
  decryptToString,
  encodeBase64,
  encryptString,
  generateSalt,
  deriveKey,
} from './crypto';
import {
  clearStore,
  getEncryptedValue,
  getMetaValue,
  getSalt as readSalt,
  removeMetaValue,
  resetVault,
  setEncryptedValue,
  setMetaValue,
  setSalt as writeSalt,
} from './db';
import { EXPORT_VERSION, VAULT_STORES } from './constants';
import type { EncryptedPayload, VaultExportEnvelope, VaultDataStoreKey, VaultValue } from './types';
import { validateVaultValue } from './validators';

const DATA_STORES: VaultDataStoreKey[] = [
  VAULT_STORES.profile,
  VAULT_STORES.compliance,
  VAULT_STORES.history,
  VAULT_STORES.policies,
];

const RESUME_META_KEY = 'resume_blob';

class VaultService {
  private async getSalt(allowCreate: boolean): Promise<Uint8Array | null> {
    const existing = await readSalt();
    if (existing) {
      return decodeBase64(existing);
    }

    if (!allowCreate) {
      return null;
    }

    const salt = generateSalt();
    await writeSalt(encodeBase64(salt));
    return salt;
  }

  private async getKey(password: string, allowSaltCreation: boolean) {
    const salt = await this.getSalt(allowSaltCreation);
    if (!salt) {
      return null;
    }
    const key = await deriveKey(password, salt);
    return { key, salt };
  }

  async initialize(password: string): Promise<void> {
    await this.getKey(password, true);
  }

  async isInitialized(): Promise<boolean> {
    const salt = await readSalt();
    return Boolean(salt);
  }

  async save<T extends VaultDataStoreKey>(
    store: T,
    value: VaultValue<T>,
    password: string
  ): Promise<void> {
    const keyArtifacts = await this.getKey(password, true);
    if (!keyArtifacts) {
      throw new Error('Unable to initialize vault.');
    }
    const normalized = validateVaultValue(store, value);
    const payload = await encryptString(keyArtifacts.key, JSON.stringify(normalized));
    await setEncryptedValue(store, payload);
  }

  async load<T extends VaultDataStoreKey>(
    store: T,
    password: string
  ): Promise<VaultValue<T> | null> {
    const payload = await getEncryptedValue(store);
    if (!payload) {
      return null;
    }

    const keyArtifacts = await this.getKey(password, false);
    if (!keyArtifacts) {
      throw new Error('Vault not initialized.');
    }

    const plaintext = await decryptToString(keyArtifacts.key, payload);
    const parsed = JSON.parse(plaintext) as unknown;
    return validateVaultValue(store, parsed);
  }

  async remove(store: VaultDataStoreKey): Promise<void> {
    await clearStore(store);
  }

  async clearAll(): Promise<void> {
    await resetVault();
  }

  async saveResume(data: ArrayBuffer, password: string): Promise<void> {
    const keyArtifacts = await this.getKey(password, true);
    if (!keyArtifacts) {
      throw new Error('Unable to initialize vault.');
    }

    const base64 = encodeBase64(data);
    const payload = await encryptString(keyArtifacts.key, base64);
    await setMetaValue(RESUME_META_KEY, JSON.stringify(payload));
  }

  async loadResume(password: string): Promise<ArrayBuffer | null> {
    const persisted = await getMetaValue(RESUME_META_KEY);
    if (!persisted) {
      return null;
    }

    const keyArtifacts = await this.getKey(password, false);
    if (!keyArtifacts) {
      throw new Error('Vault not initialized.');
    }

    const parsed = JSON.parse(persisted) as EncryptedPayload;
    const base64 = await decryptToString(keyArtifacts.key, parsed);
    const bytes = decodeBase64(base64);
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
  }

  async clearResume(): Promise<void> {
    await removeMetaValue(RESUME_META_KEY);
  }

  async export(password: string): Promise<VaultExportEnvelope> {
    const keyArtifacts = await this.getKey(password, false);
    if (!keyArtifacts) {
      throw new Error('Vault not initialized.');
    }

    const storeEntries = (
      await Promise.all(
        DATA_STORES.map(async (store) => {
          const value = await getEncryptedValue(store);
          return value ? ([store, value] as const) : null;
        })
      )
    ).filter(Boolean) as Array<[VaultDataStoreKey, EncryptedPayload]>;

    return {
      version: EXPORT_VERSION,
      createdAt: new Date().toISOString(),
      salt: encodeBase64(keyArtifacts.salt),
      stores: Object.fromEntries(storeEntries),
    };
  }

  async import(envelope: VaultExportEnvelope, password: string): Promise<void> {
    if (!envelope?.salt) {
      throw new Error('Invalid vault import: missing salt');
    }

    const salt = decodeBase64(envelope.salt);
    const key = await deriveKey(password, salt);

    const entries = Object.entries(envelope.stores ?? {}) as Array<
      [VaultDataStoreKey, EncryptedPayload]
    >;

    const firstEntry = entries[0];
    if (firstEntry) {
      const [, payload] = firstEntry;
      try {
        await decryptToString(key, payload);
      } catch (error) {
        throw new Error('Unable to decrypt vault data; check your password.');
      }
    }

    await resetVault();
    await writeSalt(envelope.salt);

    await Promise.all(entries.map(([store, payload]) => setEncryptedValue(store, payload)));
  }
}

export const vaultService = new VaultService();
