import { openDB, type DBSchema } from 'idb';

// Constants
const VAULT_DB_NAME = 'JobzippyVault';
const VAULT_DB_VERSION = 1;
const SALT_KEY = 'vault_salt';

const VAULT_STORES = {
  profile: 'profile',
  compliance: 'compliance',
  history: 'history',
  policies: 'policies',
  meta: 'meta',
} as const;

type VaultDataStoreKey = (typeof VAULT_STORES)[keyof typeof VAULT_STORES];

interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

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
const RESUME_META_KEY = 'resume_blob';

// Crypto Utils (Native Web Crypto API available in Service Worker)
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await self.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return self.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 250000,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptToString(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = decodeBase64(payload.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  const plaintext = await self.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return textDecoder.decode(plaintext);
}

// DB Utils
const dbPromise = openDB<VaultDBSchema>(VAULT_DB_NAME, VAULT_DB_VERSION, {
  upgrade(db) {
    Object.values(VAULT_STORES).forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    });
  },
});

async function getEncryptedValue(store: VaultDataStoreKey): Promise<EncryptedPayload | undefined> {
  const db = await dbPromise;
  return db.get(store, SINGLETON_KEY) as Promise<EncryptedPayload | undefined>;
}

async function getSalt(): Promise<string | undefined> {
  const db = await dbPromise;
  return db.get(VAULT_STORES.meta, SALT_KEY);
}

async function getMetaValue(key: string): Promise<string | undefined> {
  const db = await dbPromise;
  return db.get(VAULT_STORES.meta, key);
}

// Service
export class BackgroundVaultService {
  async load(storeName: string, password: string): Promise<any | null> {
    // Map store name to key
    const storeKey = Object.values(VAULT_STORES).find((s) => s === storeName);
    if (!storeKey) {
      console.warn('BackgroundVaultService: Unknown store', storeName);
      return null;
    }

    // Retrieve encrypted payload
    const payload = await getEncryptedValue(storeKey as VaultDataStoreKey);
    if (!payload) {
      console.warn('BackgroundVaultService: No data for store', storeKey);
      return null;
    }

    // Retrieve salt
    const saltBase64 = await getSalt();
    if (!saltBase64) {
      console.warn('BackgroundVaultService: No salt found in meta store');
      return null;
    }
    console.log('BackgroundVaultService: Retrieved salt (base64):', saltBase64);
    const salt = decodeBase64(saltBase64);
    const key = await deriveKey(password, salt);

    try {
      const plaintext = await decryptToString(key, payload);
      return JSON.parse(plaintext);
    } catch (e) {
      console.error('BackgroundVaultService: Decryption failed for store', storeKey, e);
      return null;
    }
  }

  async loadResume(password: string): Promise<ArrayBuffer | null> {
    const persisted = await getMetaValue(RESUME_META_KEY);
    if (!persisted) {
      return null;
    }

    const saltBase64 = await getSalt();
    if (!saltBase64) {
      console.warn('BackgroundVaultService: No salt found in meta store');
      return null;
    }
    const salt = decodeBase64(saltBase64);
    const key = await deriveKey(password, salt);

    try {
      const parsed = JSON.parse(persisted) as EncryptedPayload;
      const base64 = await decryptToString(key, parsed);
      const bytes = decodeBase64(base64);
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer;
    } catch (e) {
      console.error('BackgroundVaultService: Decryption failed for resume', e);
      return null;
    }
  }
}

export const backgroundVaultService = new BackgroundVaultService();
export const STORES = VAULT_STORES;
