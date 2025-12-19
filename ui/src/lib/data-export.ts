/**
 * Data export utility for backing up extension data
 */

import { getAllStorage } from './storage';
import { getAllJobs } from './jobs/db';
import { logger } from './logger';

export interface DataExport {
  timestamp: string;
  chromeStorage: Record<string, any>;
  indexedDB: {
    jobs: any[];
    vault: {
      profile: any[];
      compliance: any[];
      history: any[];
      policies: any[];
      meta: any[];
    };
  };
}

/**
 * Export all extension data (chrome.storage + IndexedDB)
 */
export async function exportAllData(): Promise<DataExport> {
  logger.log('DataExport', '🔍 Starting full data export...');

  const data: DataExport = {
    timestamp: new Date().toISOString(),
    chromeStorage: {},
    indexedDB: {
      jobs: [],
      vault: {
        profile: [],
        compliance: [],
        history: [],
        policies: [],
        meta: [],
      },
    },
  };

  // 1. Export Chrome Storage
  logger.log('DataExport', '📦 Reading chrome.storage.local...');
  data.chromeStorage = await getAllStorage();
  logger.log('DataExport', `✓ Chrome Storage: ${Object.keys(data.chromeStorage).length} keys`);

  // 2. Export Jobs from IndexedDB
  logger.log('DataExport', '📊 Reading JobzippyJobs IndexedDB...');
  data.indexedDB.jobs = await getAllJobs();
  logger.log('DataExport', `✓ Jobs: ${data.indexedDB.jobs.length} records`);

  // 3. Export Vault from IndexedDB
  logger.log('DataExport', '🔐 Reading JobzippyVault IndexedDB...');
  const { openDB } = await import('idb');

  try {
    const vaultDB = await openDB('JobzippyVault', 1);
    const stores = ['profile', 'compliance', 'history', 'policies', 'meta'];

    for (const storeName of stores) {
      const tx = vaultDB.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const allData = await store.getAll();
      data.indexedDB.vault[storeName as keyof typeof data.indexedDB.vault] = allData;
      logger.log('DataExport', `✓ Vault.${storeName}: ${allData.length} records`);
    }
  } catch (error) {
    logger.error('DataExport', 'Failed to read vault', error);
  }

  // Log full export as JSON
  logger.log('DataExport', '📋 EXPORT_DATA_START');
  logger.log('DataExport', JSON.stringify(data, null, 2));
  logger.log('DataExport', '📋 EXPORT_DATA_END');

  logger.log('DataExport', '✅ Export complete!');
  logger.log(
    'DataExport',
    `Summary: ${Object.keys(data.chromeStorage).length} storage keys, ${data.indexedDB.jobs.length} jobs`
  );

  return data;
}

/**
 * Console helper - call this from DevTools
 */
(globalThis as any).exportJobzippyData = exportAllData;
