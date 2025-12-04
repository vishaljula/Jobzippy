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
