/**
 * Debounced backup scheduler for Google Sheets
 * Waits 5 seconds after the last change before triggering backup
 */

import { backupToSheets } from './sheets-backup';
import { logger } from './logger';

let backupTimer: NodeJS.Timeout | null = null;
let accessToken: string | null = null;

/**
 * Schedule a backup to Google Sheets (debounced)
 * Will wait 5 seconds after the last call before actually backing up
 */
export function scheduleBackup(token: string): void {
  accessToken = token;

  if (backupTimer) {
    clearTimeout(backupTimer);
  }

  backupTimer = setTimeout(async () => {
    if (!accessToken) {
      logger.warn('scheduleBackup', 'No access token available for backup');
      return;
    }

    try {
      logger.log('scheduleBackup', 'Starting debounced backup to Google Sheets');
      await backupToSheets(accessToken);
      logger.log('scheduleBackup', 'Backup completed successfully');
    } catch (error) {
      logger.error('scheduleBackup', 'Backup failed', error);
    } finally {
      backupTimer = null;
      accessToken = null;
    }
  }, 5000); // Wait 5 seconds after last change
}

/**
 * Force immediate backup (bypasses debounce)
 */
export async function forceBackup(token: string): Promise<void> {
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }

  try {
    logger.log('forceBackup', 'Starting immediate backup to Google Sheets');
    await backupToSheets(token);
    logger.log('forceBackup', 'Backup completed successfully');
  } catch (error) {
    logger.error('forceBackup', 'Backup failed', error);
    throw error;
  }
}
