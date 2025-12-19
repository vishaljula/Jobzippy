import { fetch } from 'undici';
import { z } from 'zod';

export interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  tags: string[];
  jobTypes: string[];
  publishedAt: string;
  snippet: string;
  source: 'arbeitnow';
  status: 'queued' | 'applying' | 'in-progress' | 'completed' | 'rejected';
}

export interface JobSearchFilters {
  keywords?: string[];
  locations?: string[];
  remoteOnly?: boolean;
  limit?: number;
}

const arbeitnowJobSchema = z.object({
  slug: z.string(),
  company_name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  remote: z.boolean().optional().default(false),
  url: z.string().url(),
  tags: z.array(z.string()),
  job_types: z.array(z.string()),
  location: z.string(),
  created_at: z.number(),
});

const arbeitnowResponseSchema = z.object({
  data: z.array(arbeitnowJobSchema),
});

const JOB_SOURCE_URL = 'https://www.arbeitnow.com/api/job-board-api';

function normalizeText(value: string | undefined): string {
  return value ? value.toLowerCase() : '';
}

function stripHtml(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, '');
}

function matchesKeywords(job: z.infer<typeof arbeitnowJobSchema>, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const haystack = `${job.title} ${stripHtml(job.description)}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function matchesLocation(
  job: z.infer<typeof arbeitnowJobSchema>,
  locations: string[],
  remoteOnly?: boolean
): boolean {
  if (remoteOnly && job.remote) {
    return true;
  }
  if (!locations.length) {
    return remoteOnly ? job.remote : true;
  }
  const jobLocation = normalizeText(job.location);
  const locationHit = locations.some((location) => jobLocation.includes(location.toLowerCase()));
  if (locationHit) return true;
  return remoteOnly ? job.remote : locationHit;
}

function mapJob(job: z.infer<typeof arbeitnowJobSchema>): JobMatch {
  const snippet = stripHtml(job.description)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);

  return {
    id: job.slug,
    title: job.title,
    company: job.company_name,
    location: job.location,
    remote: Boolean(job.remote),
    url: job.url,
    tags: job.tags,
    jobTypes: job.job_types,
    publishedAt: new Date(job.created_at * 1000).toISOString(),
    snippet,
    source: 'arbeitnow',
    status: 'queued',
  };
}

export async function fetchJobMatches(filters: JobSearchFilters): Promise<JobMatch[]> {
  const response = await fetch(JOB_SOURCE_URL, {
    headers: {
      'User-Agent': 'Jobzippy/0.1 (+https://jobzippy.com)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Job source responded with ${response.status}`);
  }

  const payload = arbeitnowResponseSchema.parse(await response.json());
  const keywords = filters.keywords?.filter(Boolean) ?? [];
  const locations = filters.locations?.filter(Boolean) ?? [];
  const limit = filters.limit ?? 12;

  const normalized = payload.data
    .filter((job) => matchesKeywords(job, keywords))
    .filter((job) => matchesLocation(job, locations, filters.remoteOnly))
    .slice(0, limit)
    .map(mapJob);

  return normalized;
}

