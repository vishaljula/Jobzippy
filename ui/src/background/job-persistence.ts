/**
 * Job Persistence Helper for Background Worker
 * 
 * Maps between background worker's jobId (page job ID) and IndexedDB job records
 * using the normalized URL format.
 */

import { upsertJob, type JobRecord } from '../lib/jobs/store';
import type { JobQueueItem } from './index';

// Export for use in background/index.ts
export const jobIdToMetadata = new Map<
  string,
  {
    platform: 'LinkedIn' | 'Indeed';
    url: string;
    title: string;
    company: string;
    location: string;
    applyType?: 'easy_apply' | 'external' | 'unknown';
  }
>();


/**
 * Register a job from the queue with its metadata
 */
export function registerJobFromQueue(
  jobId: string,
  queueItem: JobQueueItem
): void {
  jobIdToMetadata.set(jobId, {
    platform: queueItem.platform,
    url: queueItem.url,
    title: queueItem.title,
    company: queueItem.company,
    location: queueItem.location,
    applyType: queueItem.applyType,
  });
}

/**
 * Get metadata for a jobId
 */
function getJobMetadata(jobId: string) {
  return jobIdToMetadata.get(jobId);
}

/**
 * Persist a job when it's queued
 */
export async function persistJobQueued(
  jobId: string,
  sourceTabId?: number
): Promise<JobRecord | null> {
  const metadata = getJobMetadata(jobId);
  if (!metadata) {
    console.warn(`[JobPersistence] No metadata found for jobId=${jobId}, skipping persist`);
    return null;
  }

  try {
    console.log(`[JobPersistence] Persisting job queued: ${jobId}`, metadata);
    const platform = metadata.platform.toLowerCase();
    const record = await upsertJob(platform, metadata.url, {
      title: metadata.title,
      company: metadata.company,
      location: metadata.location,
      status: 'queued',
      sourceTabId,
      applyType: metadata.applyType,
    });

    console.log(`[JobPersistence] Job persisted successfully:`, record.id);
    // Broadcast update to dashboard
    broadcastJobUpdate(record);
    return record;
  } catch (error) {
    console.error(`[JobPersistence] Error persisting job ${jobId}:`, error);
    return null;
  }
}

/**
 * Update job status to applying
 */
export async function persistJobApplying(
  jobId: string
): Promise<JobRecord | null> {
  const metadata = getJobMetadata(jobId);
  if (!metadata) {
    return null;
  }

  const platform = metadata.platform.toLowerCase();
  const record = await upsertJob(platform, metadata.url, {
    title: metadata.title,
    company: metadata.company,
    location: metadata.location,
    status: 'applying',
    applyType: metadata.applyType,
  });

  broadcastJobUpdate(record);
  return record;
}

/**
 * Update job status to ats_filling
 */
export async function persistJobAtsFilling(
  jobId: string,
  atsTabId?: number
): Promise<JobRecord | null> {
  const metadata = getJobMetadata(jobId);
  if (!metadata) {
    return null;
  }

  const platform = metadata.platform.toLowerCase();
  const record = await upsertJob(platform, metadata.url, {
    title: metadata.title,
    company: metadata.company,
    location: metadata.location,
    status: 'ats_filling',
    atsTabId,
    applyType: metadata.applyType,
  });

  broadcastJobUpdate(record);
  return record;
}

/**
 * Determine if an error should be marked as "skipped" vs "failed"
 * Skipped = scenarios that aren't failures but require manual intervention or are expected
 */
function shouldSkipJob(error?: string): boolean {
  if (!error) return false;

  const errorLower = error.toLowerCase();

  // Duplicate/already applied scenarios
  if (errorLower.includes('duplicate') ||
    errorLower.includes('already applied') ||
    errorLower.includes('already exists') ||
    errorLower.includes('already completed') ||
    errorLower.includes('already failed')) {
    return true;
  }

  // CAPTCHA scenarios
  if (errorLower.includes('captcha') ||
    errorLower.includes('verification required') ||
    errorLower.includes('human verification') ||
    errorLower.includes('complex_captcha')) {
    return true;
  }

  // Account creation required
  if (errorLower.includes('create account') ||
    errorLower.includes('sign up') ||
    errorLower.includes('registration required') ||
    errorLower.includes('account required') ||
    errorLower.includes('account_required') ||
    errorLower.includes('please create an account')) {
    return true;
  }

  // Manual input required (often means form can't be auto-filled)
  if (errorLower.includes('manual_input_required') ||
    errorLower.includes('manual input') ||
    errorLower.includes('required fields missing')) {
    return true;
  }

  return false;
}

/**
 * Persist job completion
 */
export async function persistJobCompleted(
  jobId: string,
  success: boolean,
  error?: string
): Promise<JobRecord | null> {
  const metadata = getJobMetadata(jobId);
  if (!metadata) {
    return null;
  }

  const platform = metadata.platform.toLowerCase();

  // Determine status: completed, skipped, or failed
  let status: JobRecord['status'];
  if (success) {
    status = 'completed';
  } else if (shouldSkipJob(error)) {
    status = 'skipped';
  } else {
    status = 'failed';
  }

  const record = await upsertJob(platform, metadata.url, {
    title: metadata.title,
    company: metadata.company,
    location: metadata.location,
    status,
    errorMessage: error,
    applyType: metadata.applyType,
  });

  if (record) {
    broadcastJobUpdate(record);
  }

  // Cleanup metadata after completion
  jobIdToMetadata.delete(jobId);

  return record;
}

/**
 * Broadcast job update to dashboard
 */
function broadcastJobUpdate(record: JobRecord): void {
  try {
    console.log('[JobPersistence] Broadcasting job update:', record.id, record.status);
    chrome.runtime.sendMessage(
      {
        type: 'DASHBOARD_JOB_UPDATED',
        data: record,
      },
      (_response) => {
        if (chrome.runtime.lastError) {
          // Sidepanel might not be open - this is expected
          console.log('[JobPersistence] Message not delivered (sidepanel may be closed):', chrome.runtime.lastError.message);
        } else {
          console.log('[JobPersistence] Job update broadcasted successfully');
        }
      }
    );
  } catch (error) {
    console.error('[JobPersistence] Error broadcasting job update:', error);
  }
}

/**
 * Cleanup metadata for a job
 */
export function cleanupJobMetadata(jobId: string): void {
  jobIdToMetadata.delete(jobId);
}

