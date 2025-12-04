/**
 * Google Sheets backup/restore for IndexedDB and chrome.storage
 */

import { getAllJobs } from './jobs/db';
import { getAllStorage, setStorageMultiple } from './storage';
import { logger } from './logger';
import { FirestoreRepository } from './firebase/userRepository';
import type { JobRecord } from './jobs/store-types';
import type { ExtensionStorage } from './types';

const BACKUP_SHEET_NAME = 'Jobzippy Backup';

/**
 * Get backup sheet ID from chrome.storage or Firestore
 */
async function getBackupSheetId(): Promise<string | null> {
  logger.log('SheetsBackup', 'Looking for backup sheet ID...');
  const storage = await getAllStorage();

  // First check chrome.storage
  if (storage.backupSheetId) {
    logger.log(
      'SheetsBackup',
      `✓ Found backup sheet ID in chrome.storage: ${storage.backupSheetId}`
    );
    return storage.backupSheetId;
  }

  logger.log('SheetsBackup', 'Not in chrome.storage, checking Firestore...');

  // If not in chrome.storage, try Firestore
  try {
    const userId = storage.userId;
    if (!userId) {
      logger.log('SheetsBackup', 'No userId found, cannot check Firestore', {
        storageKeys: Object.keys(storage),
        hasUserInfo: !!storage.user_info,
      });
      return null;
    }

    logger.log('SheetsBackup', `Checking Firestore for userId: ${userId}...`);
    const repo = new FirestoreRepository();
    const backupSheetId = await repo.getBackupSheetId(userId);

    if (backupSheetId) {
      logger.log('SheetsBackup', `✓✓ Found backup sheet ID in Firestore: ${backupSheetId}`);
      logger.log('SheetsBackup', `Saving to chrome.storage for faster future access...`);
      // Save to chrome.storage for faster future access
      await setStorageMultiple({ backupSheetId });
      logger.log('SheetsBackup', `✓ Saved to chrome.storage`);
      return backupSheetId;
    } else {
      logger.log('SheetsBackup', 'No backup sheet ID found in Firestore (null/undefined)');
    }
  } catch (error) {
    logger.error('SheetsBackup', 'Failed to get backup sheet ID from Firestore', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  logger.log('SheetsBackup', 'No backup sheet ID found anywhere');
  return null;
}

/**
 * Get or create backup spreadsheet
 */
async function getOrCreateBackupSheet(accessToken: string): Promise<string> {
  // Check if we already have a backup sheet ID
  const existingSheetId = await getBackupSheetId();
  if (existingSheetId) {
    logger.log('SheetsBackup', `Using existing backup sheet: ${existingSheetId}`);
    return existingSheetId;
  }

  const storage = await getAllStorage();

  // Create new backup sheet
  logger.log('SheetsBackup', 'Creating new backup spreadsheet...');

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: BACKUP_SHEET_NAME,
      },
      sheets: [
        { properties: { title: 'Vault', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Jobs', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Metadata', gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetails = errorJson.error?.message || errorText;
    } catch {
      // Keep errorText as is
    }
    logger.error(
      'SheetsBackup',
      `Failed to create backup sheet: ${response.status} ${response.statusText}`,
      errorDetails
    );
    throw new Error(
      `Failed to create backup sheet: ${response.status} ${response.statusText} - ${errorDetails}`
    );
  }

  const data = await response.json();
  const sheetId = data.spreadsheetId;

  // Save sheet ID to chrome.storage
  logger.log('SheetsBackup', `Saving backup sheet ID to chrome.storage: ${sheetId}`);
  await setStorageMultiple({ backupSheetId: sheetId });
  logger.log('SheetsBackup', `✓ Saved to chrome.storage`);

  // CRITICAL: Also save to Firestore for disaster recovery
  // If this fails, the backup is not truly safe (chrome.storage can be cleared)
  logger.log('SheetsBackup', `Attempting to save backup sheet ID to Firestore...`);

  const userId = storage.userId;
  if (!userId) {
    logger.error('SheetsBackup', 'CRITICAL: No userId found in storage, cannot save to Firestore', {
      storageKeys: Object.keys(storage),
      hasUserInfo: !!storage.user_info,
      userInfoSub: storage.user_info?.sub,
    });
    throw new Error('Cannot save backup sheet ID: No userId found. User must be signed in.');
  }

  logger.log('SheetsBackup', `Found userId: ${userId}, initializing Firestore repository...`);

  try {
    const repo = new FirestoreRepository();
    logger.log(
      'SheetsBackup',
      `Calling updateBackupSheetId(userId: ${userId}, sheetId: ${sheetId})...`
    );

    await repo.updateBackupSheetId(userId, sheetId);

    logger.log('SheetsBackup', `✓ updateBackupSheetId() completed successfully`);

    // Verify it was saved
    logger.log('SheetsBackup', `Verifying Firestore save by reading it back...`);
    const verifySheetId = await repo.getBackupSheetId(userId);

    if (verifySheetId === sheetId) {
      logger.log('SheetsBackup', `✓✓ VERIFIED: Backup sheet ID saved to Firestore successfully!`, {
        userId,
        sheetId,
        verified: verifySheetId,
      });
    } else {
      logger.error('SheetsBackup', `VERIFICATION FAILED: Sheet ID mismatch!`, {
        expected: sheetId,
        actual: verifySheetId,
      });
      throw new Error(`Firestore verification failed: expected ${sheetId}, got ${verifySheetId}`);
    }
  } catch (error) {
    logger.error('SheetsBackup', 'CRITICAL: Failed to save backup sheet ID to Firestore', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      sheetId,
    });
    throw new Error(
      `Failed to save backup sheet ID to Firestore: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  logger.log('SheetsBackup', `Created backup sheet: ${sheetId}`);
  return sheetId;
}

/**
 * Backup encrypted vault data to Google Sheets
 */
async function backupVault(accessToken: string, sheetId: string): Promise<void> {
  logger.log('SheetsBackup', 'Backing up encrypted vault data...');

  // Read encrypted data directly from IndexedDB (no password needed!)
  const { openDB } = await import('idb');
  const vaultDB = await openDB('JobzippyVault', 1);

  const rows: string[][] = [['Store', 'IV', 'Ciphertext', 'Last Updated']];

  const timestamp = new Date().toISOString();
  const stores = ['profile', 'compliance', 'history', 'policies'];

  for (const storeName of stores) {
    const tx = vaultDB.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const data = await store.get('singleton');

    if (data && data.iv && data.ciphertext) {
      rows.push([storeName, data.iv, data.ciphertext, timestamp]);
    }
  }

  // Also backup the salt (needed for decryption)
  const metaTx = vaultDB.transaction('meta', 'readonly');
  const metaStore = metaTx.objectStore('meta');
  const salt = await metaStore.get('vault_salt');

  if (salt) {
    rows.push(['_salt', '', salt, timestamp]);
  }

  // Update sheet
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Vault!A1:D${rows.length}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  logger.log('SheetsBackup', `✓ Vault backed up (${rows.length - 1} encrypted stores)`);
}

/**
 * Backup jobs to Google Sheets
 */
async function backupJobs(accessToken: string, sheetId: string, jobs: JobRecord[]): Promise<void> {
  logger.log('SheetsBackup', `Backing up ${jobs.length} jobs...`);

  const rows: string[][] = [
    [
      'ID',
      'Platform',
      'Job ID',
      'Title',
      'Company',
      'Location',
      'Status',
      'Attempts',
      'Created At',
      'Updated At',
      'Last Applied At',
      'URL',
      'Error Message',
      'Apply Type',
    ],
  ];

  for (const job of jobs) {
    rows.push([
      job.id,
      job.platform,
      job.jobId,
      job.title,
      job.company,
      job.location || '',
      job.status,
      String(job.attempts),
      new Date(job.createdAt).toISOString(),
      new Date(job.updatedAt).toISOString(),
      job.lastAppliedAt ? new Date(job.lastAppliedAt).toISOString() : '',
      job.url || '',
      job.errorMessage || '',
      job.applyType || '',
    ]);
  }

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Jobs!A1:N${rows.length}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  logger.log('SheetsBackup', `✓ Jobs backed up (${jobs.length} records)`);
}

/**
 * Backup metadata to Google Sheets
 */
async function backupMetadata(accessToken: string, sheetId: string): Promise<void> {
  logger.log('SheetsBackup', 'Backing up metadata...');

  const storage = await getAllStorage();
  const timestamp = new Date().toISOString();

  const rows: string[][] = [
    ['Key', 'Value', 'Last Updated'],
    ['onboarding_status', JSON.stringify(storage.onboardingStatus), timestamp],
    ['user_id', storage.userId || '', timestamp],
    ['backup_sheet_id', storage.backupSheetId || '', timestamp],
    ['user_info', JSON.stringify(storage.user_info || {}), timestamp],
    ['last_backup', timestamp, timestamp],
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Metadata!A1:C${rows.length}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    }
  );

  logger.log('SheetsBackup', '✓ Metadata backed up (6 keys)');
}

/**
 * Restore encrypted vault from Google Sheets
 */
async function restoreVault(accessToken: string, sheetId: string): Promise<boolean> {
  logger.log('SheetsBackup', 'Restoring encrypted vault from backup...');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Vault!A2:D`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    logger.error('SheetsBackup', 'Failed to restore vault', response.statusText);
    return false;
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  if (rows.length === 0) {
    logger.log('SheetsBackup', 'No vault data found in backup');
    return false;
  }

  // Write encrypted data back to IndexedDB
  const { openDB } = await import('idb');
  const vaultDB = await openDB('JobzippyVault', 1);

  let salt: string | null = null;

  for (const [storeName, iv, ciphertext] of rows) {
    if (storeName === '_salt') {
      salt = ciphertext; // Salt is stored in ciphertext column
      continue;
    }

    if (iv && ciphertext) {
      const tx = vaultDB.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await store.put({ iv, ciphertext }, 'singleton');
    }
  }

  // Restore salt
  if (salt) {
    const metaTx = vaultDB.transaction('meta', 'readwrite');
    const metaStore = metaTx.objectStore('meta');
    await metaStore.put(salt, 'vault_salt');
  }

  logger.log('SheetsBackup', `✓ Vault restored (${rows.length - 1} encrypted stores)`);
  return true;
}

/**
 * Restore jobs from Google Sheets
 */
async function restoreJobs(accessToken: string, sheetId: string): Promise<JobRecord[]> {
  logger.log('SheetsBackup', 'Restoring jobs from backup...');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Jobs!A2:N`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    logger.error('SheetsBackup', 'Failed to restore jobs', response.statusText);
    return [];
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  const jobs: JobRecord[] = rows.map((row) => ({
    id: row[0],
    platform: row[1],
    jobId: row[2],
    title: row[3],
    company: row[4],
    location: row[5] || undefined,
    status: row[6] as JobRecord['status'],
    attempts: Number(row[7]),
    createdAt: new Date(row[8]).getTime(),
    updatedAt: new Date(row[9]).getTime(),
    lastAppliedAt: row[10] ? new Date(row[10]).getTime() : undefined,
    url: row[11] || undefined,
    errorMessage: row[12] || undefined,
    applyType: (row[13] as any) || undefined,
  }));

  logger.log('SheetsBackup', `✓ Jobs restored (${jobs.length} records)`);
  return jobs;
}

/**
 * Restore metadata from Google Sheets
 */
async function restoreMetadata(accessToken: string, sheetId: string): Promise<boolean> {
  logger.log('SheetsBackup', 'Restoring metadata from backup...');

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Metadata!A2:C`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    logger.error('SheetsBackup', 'Failed to restore metadata', response.statusText);
    return false;
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  if (rows.length === 0) {
    logger.log('SheetsBackup', 'No metadata found in backup');
    return false;
  }

  // Parse metadata rows and restore to chrome.storage
  const metadata: Record<string, any> = {};

  for (const [key, value] of rows) {
    if (!key || !value) continue;

    try {
      // Try to parse JSON values
      metadata[key] = JSON.parse(value);
    } catch {
      // If not JSON, store as string
      metadata[key] = value;
    }
  }

  // Restore to chrome.storage (only restore safe keys)
  const toRestore: Partial<ExtensionStorage> = {};

  if (metadata.onboarding_status) {
    // CRITICAL: If we're restoring from backup, the user must have completed onboarding
    // Force status to 'completed' to prevent onboarding wizard from reopening
    toRestore.onboardingStatus = {
      ...metadata.onboarding_status,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    };
    logger.log(
      'SheetsBackup',
      '→ Forcing onboarding status to completed (restore implies completion)'
    );
  }
  if (metadata.user_id) {
    toRestore.userId = metadata.user_id;
  }
  if (metadata.backup_sheet_id) {
    toRestore.backupSheetId = metadata.backup_sheet_id;
  }
  if (metadata.user_info) {
    toRestore.user_info = metadata.user_info;
  }

  await setStorageMultiple(toRestore);

  logger.log('SheetsBackup', `✓ Metadata restored (${Object.keys(toRestore).length} keys)`);
  return true;
}

/**
 * Full backup to Google Sheets
 */
export async function backupToSheets(accessToken: string): Promise<void> {
  logger.log('SheetsBackup', '🔄 Starting full backup...');

  const sheetId = await getOrCreateBackupSheet(accessToken);
  const jobs = await getAllJobs();

  await Promise.all([
    backupVault(accessToken, sheetId),
    backupJobs(accessToken, sheetId, jobs),
    backupMetadata(accessToken, sheetId),
  ]);

  logger.log('SheetsBackup', '✅ Full backup complete!');
}

/**
 * Full restore from Google Sheets
 */
export async function restoreFromSheets(
  accessToken: string,
  sheetId: string
): Promise<{
  vaultRestored: boolean;
  jobs: JobRecord[];
  metadataRestored: boolean;
}> {
  logger.log('SheetsBackup', '🔄 Starting full restore...');

  const [vaultRestored, jobs, metadataRestored] = await Promise.all([
    restoreVault(accessToken, sheetId),
    restoreJobs(accessToken, sheetId),
    restoreMetadata(accessToken, sheetId),
  ]);

  logger.log('SheetsBackup', '✅ Full restore complete!');
  return { vaultRestored, jobs, metadataRestored };
}

/**
 * Check if backup exists
 */
export async function hasBackup(accessToken: string): Promise<boolean> {
  const backupSheetId = await getBackupSheetId();

  if (!backupSheetId) {
    return false;
  }

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${backupSheetId}/values/Metadata!A1:A1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get backup sheet ID (checks chrome.storage and Firestore)
 * Exported for use by startup-restore
 */
export { getBackupSheetId };
