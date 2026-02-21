import type { JobRecord, JobStats } from './store-types';
import * as db from './db';
import { logger } from '../logger';
import { scheduleBackup } from '../backup-scheduler';
import { getStorage } from '../storage';

// Re-export types for convenience
export type { JobRecord, JobStats };

/**
 * Generate a unique database ID from platform and job ID
 * Job ID comes from data-job-id (LinkedIn) or data-jk (Indeed)
 */
export function generateJobId(platform: string, jobId: string): string {
  return `${platform}::${jobId}`;
}

/**
 * Trigger backup to Google Sheets (debounced)
 * Gets OAuth token from storage and schedules backup
 */
async function triggerBackup(): Promise<void> {
  try {
    const tokens = await getStorage('oauth_tokens');
    if (tokens?.access_token) {
      scheduleBackup(tokens.access_token);
    }
  } catch (error) {
    logger.error('JobStore', 'Failed to trigger backup', error);
  }
}

/**
 * Create or update a job record
 */
export async function upsertJob(
  platform: string,
  jobId: string,
  data: {
    title: string;
    company: string;
    location?: string;
    url?: string;
    status?: JobRecord['status'];
    sourceTabId?: number;
    atsTabId?: number;
    applyType?: 'easy_apply' | 'external' | 'unknown';
    errorMessage?: string;
    needsConfirmation?: boolean;
  }
): Promise<JobRecord> {
  const id = generateJobId(platform, jobId);

  const existing = await db.getJob(id);
  const now = Date.now();

  if (existing) {
    // Update existing record
    const updated: JobRecord = {
      ...existing,
      ...data,
      status: data.status ?? existing.status,
      updatedAt: now,
      attempts:
        data.status && data.status !== existing.status ? existing.attempts + 1 : existing.attempts,
      lastAppliedAt:
        data.status === 'applying' || data.status === 'ats_filling' ? now : existing.lastAppliedAt,
      errorMessage: data.errorMessage ?? existing.errorMessage,
      sourceTabId: data.sourceTabId ?? existing.sourceTabId,
      atsTabId: data.atsTabId ?? existing.atsTabId,
      applyType: data.applyType ?? existing.applyType,
      url: data.url ?? existing.url,
      needsConfirmation: data.needsConfirmation ?? existing.needsConfirmation,
    };
    await db.putJob(updated);

    // Schedule backup after job update
    triggerBackup();

    return updated;
  } else {
    // Create new record
    const newRecord: JobRecord = {
      id,
      platform,
      jobId,
      url: data.url,
      title: data.title,
      company: data.company,
      location: data.location,
      status: data.status ?? 'queued',
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      lastAppliedAt: data.status === 'applying' || data.status === 'ats_filling' ? now : undefined,
      errorMessage: data.errorMessage,
      sourceTabId: data.sourceTabId,
      atsTabId: data.atsTabId,
      applyType: data.applyType,
      needsConfirmation: data.needsConfirmation,
    };
    await db.putJob(newRecord);

    // Schedule backup after job creation
    triggerBackup();

    return newRecord;
  }
}

/**
 * Update job status
 */
export async function updateJobStatus(
  id: string,
  status: JobRecord['status'],
  errorMessage?: string
): Promise<JobRecord | null> {
  const existing = await db.getJob(id);
  if (!existing) {
    return null;
  }

  const now = Date.now();
  const updated: JobRecord = {
    ...existing,
    status,
    updatedAt: now,
    attempts: status !== existing.status ? existing.attempts + 1 : existing.attempts,
    lastAppliedAt: status === 'applying' || status === 'ats_filling' ? now : existing.lastAppliedAt,
    errorMessage: errorMessage ?? existing.errorMessage,
  };

  await db.putJob(updated);

  // Schedule backup after status update (e.g., Gmail replies)
  triggerBackup();

  return updated;
}

/**
 * Update job metadata (title, company, location)
 * Used when user edits job details in dashboard
 */
export async function updateJobMetadata(
  id: string,
  updates: {
    title?: string;
    company?: string;
    location?: string;
  }
): Promise<JobRecord | null> {
  const existing = await db.getJob(id);
  if (!existing) {
    logger.error('JobStore', `Cannot update metadata: job ${id} not found`);
    return null;
  }

  const now = Date.now();
  const updated: JobRecord = {
    ...existing,
    ...updates,
    updatedAt: now,
    needsConfirmation: false, // User has confirmed the metadata
  };

  await db.putJob(updated);

  // Schedule backup after metadata update
  triggerBackup();

  logger.log('JobStore', `Updated metadata for job ${id}`);
  return updated;
}

/**
 * Get job statistics
 */
export async function getJobStats(): Promise<JobStats> {
  const allJobs = await db.getAllJobs();

  const stats: JobStats = {
    total: allJobs.length,
    queued: 0,
    applying: 0,
    ats_filling: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of allJobs) {
    stats[job.status] = (stats[job.status] ?? 0) + 1;
  }

  return stats;
}

/**
 * Check if a job already exists (for duplicate detection)
 */
export async function jobExists(platform: string, jobId: string): Promise<JobRecord | null> {
  const start = Date.now();
  const id = generateJobId(platform, jobId);
  logger.log('JobStore', `jobExists check - Generated ID: ${id}`);

  const existing = await db.getJob(id);

  const duration = (Date.now() - start).toFixed(2);
  logger.log(
    'JobStore',
    `jobExists result for ${id}: ${existing ? 'FOUND' : 'NOT FOUND'} (${duration}ms)`
  );
  if (existing) {
    logger.log('JobStore', `Existing record status: ${existing.status}`);
  }

  return existing ?? null;
}

/**
 * Get jobs for dashboard display
 */
export async function getDashboardJobs(): Promise<{
  inProgress: JobRecord[];
  history: JobRecord[];
}> {
  const inProgressStatuses: JobRecord['status'][] = ['queued', 'applying', 'ats_filling'];
  const historyStatuses: JobRecord['status'][] = ['completed', 'failed', 'skipped'];

  const [inProgress, history] = await Promise.all([
    db.getJobsByStatuses(inProgressStatuses),
    db.getJobsByStatuses(historyStatuses),
  ]);

  // Sort by updatedAt descending
  inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
  history.sort((a, b) => b.updatedAt - a.updatedAt);

  return { inProgress, history };
}

/**
 * Cleanup stuck jobs on startup.
 * Jobs stuck in "applying" or "ats_filling" for more than TIMEOUT_MINUTES
 * are marked as "failed" since the in-memory JobSession was lost on reload.
 */
const STUCK_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function cleanupStuckJobs(): Promise<number> {
  try {
    const stuckStatuses: JobRecord['status'][] = ['applying', 'ats_filling'];
    const stuckJobs = await db.getJobsByStatuses(stuckStatuses);
    const now = Date.now();
    let cleanedCount = 0;

    for (const job of stuckJobs) {
      const stuckDuration = now - job.updatedAt;
      if (stuckDuration > STUCK_JOB_TIMEOUT_MS) {
        logger.log(
          'JobStore',
          `Cleaning up stuck job: ${job.id} (stuck for ${Math.round(stuckDuration / 1000)}s)`
        );
        await updateJobStatus(
          job.id,
          'failed',
          'Application timed out - extension was reloaded during application'
        );
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.log('JobStore', `Cleaned up ${cleanedCount} stuck jobs`);
    }

    return cleanedCount;
  } catch (error) {
    logger.error('JobStore', 'Error cleaning up stuck jobs', error);
    return 0; // Return 0 on error - non-fatal
  }
}
