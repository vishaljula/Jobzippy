export type JobStatus = 'queued' | 'applying' | 'ats_filling' | 'completed' | 'failed' | 'skipped';

export interface JobRecord {
  id: string; // `${platform}::${normalizedUrl}`
  platform: 'linkedin' | 'indeed' | string;
  normalizedUrl: string; // cleaned URL (no query params, no trailing slash)
  rawUrl: string; // original URL as found

  title: string;
  company: string;
  location?: string;

  status: JobStatus;
  attempts: number; // number of times we've tried to apply

  createdAt: number; // timestamp when first queued
  updatedAt: number; // timestamp of last update
  lastAppliedAt?: number; // timestamp of last application attempt
  errorMessage?: string; // error details if failed

  // Optional tracking fields
  sourceTabId?: number; // tab that initiated the job
  atsTabId?: number; // ATS tab ID if external
  applyType?: 'easy_apply' | 'external' | 'unknown';
}

export interface JobStats {
  total: number;
  queued: number;
  applying: number;
  ats_filling: number;
  completed: number;
  failed: number;
  skipped: number;
}

