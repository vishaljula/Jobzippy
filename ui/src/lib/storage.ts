/**
 * Chrome Storage utilities
 * Wrapper around chrome.storage API with type safety
 */

import type { ExtensionStorage } from './types';

/**
 * Get a value from chrome.storage.local
 */
export async function getStorage<K extends keyof ExtensionStorage>(
  key: K
): Promise<ExtensionStorage[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * Get multiple values from chrome.storage.local
 */
export async function getStorageMultiple<K extends keyof ExtensionStorage>(
  keys: K[]
): Promise<Pick<ExtensionStorage, K>> {
  const result = await chrome.storage.local.get(keys);
  return result as Pick<ExtensionStorage, K>;
}

/**
 * Get all values from chrome.storage.local
 */
export async function getAllStorage(): Promise<Partial<ExtensionStorage>> {
  const result = await chrome.storage.local.get(null);
  return result as Partial<ExtensionStorage>;
}

/**
 * Set a value in chrome.storage.local
 */
export async function setStorage<K extends keyof ExtensionStorage>(
  key: K,
  value: ExtensionStorage[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Set multiple values in chrome.storage.local
 */
export async function setStorageMultiple(items: Partial<ExtensionStorage>): Promise<void> {
  await chrome.storage.local.set(items);
}

/**
 * Remove a value from chrome.storage.local
 */
export async function removeStorage<K extends keyof ExtensionStorage>(key: K): Promise<void> {
  await chrome.storage.local.remove(key as string);
}

/**
 * Clear all values from chrome.storage.local
 */
export async function clearStorage(): Promise<void> {
  await chrome.storage.local.clear();
}

/**
 * Listen for storage changes
 */
export function onStorageChange(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      callback(changes);
    }
  });
}
