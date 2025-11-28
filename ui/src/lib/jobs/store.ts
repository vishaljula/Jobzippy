import type { JobRecord, JobStats } from './store-types';
import * as db from './db';

/**
 * Normalize a job URL by removing query parameters and trailing slashes
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and hash
    urlObj.search = '';
    urlObj.hash = '';
    // Remove trailing slash
    let normalized = urlObj.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, just remove query string manually
    const parts = url.split('?');
    const withoutQuery = parts[0]?.split('#')[0] || url;
    return withoutQuery.endsWith('/') ? withoutQuery.slice(0, -1) : withoutQuery;
  }
}

/**
 * Generate a unique job ID from platform and normalized URL
 */
export function generateJobId(platform: string, normalizedUrl: string): string {
  return `${platform}::${normalizedUrl}`;
}

/**
 * Create or update a job record
 */
export async function upsertJob(
  platform: string,
  rawUrl: string,
  data: {
    title: string;
    company: string;
    location?: string;
    status?: JobRecord['status'];
    sourceTabId?: number;
    atsTabId?: number;
    applyType?: 'easy_apply' | 'external' | 'unknown';
    errorMessage?: string;
  }
): Promise<JobRecord> {
  const normalizedUrl = normalizeUrl(rawUrl);
  const id = generateJobId(platform, normalizedUrl);

  const existing = await db.getJob(id);
  const now = Date.now();

  if (existing) {
    // Update existing record
    const updated: JobRecord = {
      ...existing,
      ...data,
      status: data.status ?? existing.status,
      updatedAt: now,
      attempts: data.status && data.status !== existing.status ? existing.attempts + 1 : existing.attempts,
      lastAppliedAt: data.status === 'applying' || data.status === 'ats_filling' ? now : existing.lastAppliedAt,
      errorMessage: data.errorMessage ?? existing.errorMessage,
      sourceTabId: data.sourceTabId ?? existing.sourceTabId,
      atsTabId: data.atsTabId ?? existing.atsTabId,
      applyType: data.applyType ?? existing.applyType,
    };
    await db.putJob(updated);
    return updated;
  } else {
    // Create new record
    const newRecord: JobRecord = {
      id,
      platform,
      normalizedUrl,
      rawUrl,
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
export async function jobExists(platform: string, url: string): Promise<JobRecord | null> {
  const normalizedUrl = normalizeUrl(url);
  const id = generateJobId(platform, normalizedUrl);
  const existing = await db.getJob(id);
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

