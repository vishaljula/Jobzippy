import {
  AES_ALGORITHM,
  AES_IV_LENGTH,
  AES_KEY_LENGTH,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_KEY_LENGTH,
} from './constants';
import type { EncryptedPayload } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
}

export function generateSalt(length = 16): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    baseKey,
    {
      name: AES_ALGORITHM,
      length: AES_KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export function encodeBase64(bytes: ArrayBuffer | Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  buffer.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = new Uint8Array(AES_IV_LENGTH);
  crypto.getRandomValues(iv);
  const encoded = textEncoder.encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: AES_ALGORITHM,
      iv,
    },
    key,
    encoded
  );

  return {
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(ciphertext),
  };
}

export async function decryptToString(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = decodeBase64(payload.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return textDecoder.decode(plaintext);
}

export async function deriveBits(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    baseKey,
    PBKDF2_KEY_LENGTH
  );
}
