import { openDB, type DBSchema } from 'idb';

import { SALT_KEY, VAULT_DB_NAME, VAULT_DB_VERSION, VAULT_STORES } from './constants';
import type { EncryptedPayload, VaultDataStoreKey } from './types';

interface VaultDBSchema extends DBSchema {
  [VAULT_STORES.profile]: {
    key: string;
    value: EncryptedPayload;
  };
  [VAULT_STORES.compliance]: {
    key: string;
    value: EncryptedPayload;
  };
  [VAULT_STORES.history]: {
    key: string;
    value: EncryptedPayload;
  };
  [VAULT_STORES.policies]: {
    key: string;
    value: EncryptedPayload;
  };
  [VAULT_STORES.meta]: {
    key: string;
    value: string;
  };
}

const SINGLETON_KEY = 'singleton';

const dbPromise = openDB<VaultDBSchema>(VAULT_DB_NAME, VAULT_DB_VERSION, {
  upgrade(db) {
    Object.values(VAULT_STORES).forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    });
  },
});

export async function getEncryptedValue(
  store: VaultDataStoreKey
): Promise<EncryptedPayload | undefined> {
  const db = await dbPromise;
  return db.get(store, SINGLETON_KEY);
}

export async function setEncryptedValue(
  store: VaultDataStoreKey,
  value: EncryptedPayload
): Promise<void> {
  const db = await dbPromise;
  await db.put(store, value, SINGLETON_KEY);
}

export async function clearStore(store: VaultDataStoreKey): Promise<void> {
  const db = await dbPromise;
  await db.delete(store, SINGLETON_KEY);
}

export async function resetVault(): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(Object.values(VAULT_STORES), 'readwrite');
  await Promise.all(
    Object.values(VAULT_STORES).map((storeName) => tx.objectStore(storeName).clear())
  );
  await tx.done;
}

export async function getSalt(): Promise<string | undefined> {
  const db = await dbPromise;
  return db.get(VAULT_STORES.meta, SALT_KEY);
}

export async function setSalt(base64Salt: string): Promise<void> {
  const db = await dbPromise;
  await db.put(VAULT_STORES.meta, base64Salt, SALT_KEY);
}

export async function setMetaValue(key: string, value: string): Promise<void> {
  const db = await dbPromise;
  await db.put(VAULT_STORES.meta, value, key);
}

export async function getMetaValue(key: string): Promise<string | undefined> {
  const db = await dbPromise;
  return db.get(VAULT_STORES.meta, key);
}

export async function removeMetaValue(key: string): Promise<void> {
  const db = await dbPromise;
  await db.delete(VAULT_STORES.meta, key);
}
