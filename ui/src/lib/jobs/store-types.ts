export type JobStatus = 'queued' | 'applying' | 'ats_filling' | 'completed' | 'failed' | 'skipped';

export interface JobRecord {
  id: string; // `${platform}::${jobId}` - e.g., "linkedin::4333911132" or "indeed::abc123"
  platform: 'linkedin' | 'indeed' | string;
  jobId: string; // Job ID from data-job-id (LinkedIn) or data-jk (Indeed)
  url?: string; // Optional URL for reference

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
