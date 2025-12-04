/**
 * Startup restore logic: Check IndexedDB → Google Sheets → Create new
 */

import { getAllJobs } from './jobs/db';
import { getAllStorage } from './storage';
import { hasBackup, restoreFromSheets, getBackupSheetId } from './sheets-backup';
import { logger } from './logger';
import type { ProfileVault } from './types';

export interface StartupState {
  hasOnboarding: boolean;
  hasJobs: boolean;
  needsRestore: boolean;
  profile: ProfileVault | null;
}

/**
 * Check if vault has profile data
 */
async function checkVaultData(): Promise<ProfileVault | null> {
  try {
    const { openDB } = await import('idb');
    const vaultDB = await openDB('JobzippyVault', 1);

    // Check if profile store has data
    const tx = vaultDB.transaction('profile', 'readonly');
    const store = tx.objectStore('profile');
    const data = await store.get('singleton');

    if (data) {
      logger.log('StartupRestore', '✓ Found profile data in vault');
      return data as any; // Encrypted, but exists
    }

    logger.log('StartupRestore', '✗ No profile data in vault');
    return null;
  } catch (error) {
    logger.error('StartupRestore', 'Error checking vault', error);
    return null;
  }
}

/**
 * Check startup state and determine if restore is needed
 */
export async function checkStartupState(): Promise<StartupState> {
  logger.log('StartupRestore', '🔍 Checking startup state...');

  // 1. Check IndexedDB for onboarding data
  const profile = await checkVaultData();
  const hasOnboarding = profile !== null;

  // 2. Check IndexedDB for jobs
  const jobs = await getAllJobs();
  const hasJobs = jobs.length > 0;

  // 3. Check chrome.storage for onboarding status
  const storage = await getAllStorage();
  const onboardingComplete = storage.onboardingStatus?.status === 'completed';

  // 4. Check if we have a backup sheet ID (in chrome.storage or Firestore)
  const hasBackupSheetId = !!(await getBackupSheetId());

  logger.log(
    'StartupRestore',
    `State: onboarding=${hasOnboarding}, jobs=${hasJobs}, status=${onboardingComplete}, hasBackup=${hasBackupSheetId}`
  );

  // If data is empty but we have a backup sheet ID, we should try to restore
  // This handles the case where chrome.storage was cleared but Firestore has the backup ID
  // Also restore if onboarding status is missing but we have vault data (partial restore)
  const needsRestore =
    (!hasOnboarding && !hasJobs && hasBackupSheetId) || // Full wipe
    (hasOnboarding && !onboardingComplete && hasBackupSheetId); // Partial data (vault exists but status missing)

  return {
    hasOnboarding,
    hasJobs,
    needsRestore,
    profile,
  };
}

/**
 * Attempt to restore from Google Sheets backup
 */
export async function attemptRestore(accessToken: string): Promise<boolean> {
  logger.log('StartupRestore', '🔄 Attempting restore from Google Sheets...');

  try {
    // Get backup sheet ID (checks chrome.storage AND Firestore)
    const backupSheetId = await getBackupSheetId();

    if (!backupSheetId) {
      logger.log(
        'StartupRestore',
        '✗ No backup sheet ID found (checked chrome.storage and Firestore)'
      );
      return false;
    }

    logger.log('StartupRestore', `Found backup sheet ID: ${backupSheetId}`);

    // Check if backup exists and is accessible
    const backupExists = await hasBackup(accessToken);

    if (!backupExists) {
      logger.log('StartupRestore', '✗ Backup sheet exists but is not accessible or empty');
      return false;
    }

    // Restore data
    const { vaultRestored, jobs, metadataRestored } = await restoreFromSheets(
      accessToken,
      backupSheetId
    );

    if (!vaultRestored && jobs.length === 0 && !metadataRestored) {
      logger.log('StartupRestore', '✗ Backup is empty');
      return false;
    }

    // Vault is already restored to IndexedDB (encrypted)
    if (vaultRestored) {
      logger.log('StartupRestore', '✓ Encrypted vault restored to IndexedDB');
    }

    if (jobs.length > 0) {
      logger.log('StartupRestore', `📝 Restoring ${jobs.length} jobs to IndexedDB...`);
      const { putJob } = await import('./jobs/db');
      await Promise.all(jobs.map((job) => putJob(job)));
      logger.log('StartupRestore', `✓ ${jobs.length} jobs restored`);
    }

    if (metadataRestored) {
      logger.log('StartupRestore', '✓ Metadata restored to chrome.storage');
    }

    logger.log('StartupRestore', '✅ Restore complete!');
    return true;
  } catch (error) {
    logger.error('StartupRestore', 'Restore failed', error);
    return false;
  }
}

/**
 * Main startup flow
 */
export async function runStartupFlow(accessToken?: string): Promise<'dashboard' | 'onboarding'> {
  const state = await checkStartupState();

  // If we need restore and have access token, try it FIRST
  if (state.needsRestore && accessToken) {
    logger.log('StartupRestore', '→ Attempting restore from backup...');
    const restored = await attemptRestore(accessToken);

    if (restored) {
      logger.log('StartupRestore', '→ Routing to dashboard (restored from backup)');
      return 'dashboard';
    }
  }

  // If we have complete onboarding data (vault + completed status), go to dashboard
  if (state.hasOnboarding) {
    logger.log('StartupRestore', '→ Routing to dashboard (data exists)');
    return 'dashboard';
  }

  // Otherwise, go to onboarding
  logger.log('StartupRestore', '→ Routing to onboarding (no data)');
  return 'onboarding';
}
