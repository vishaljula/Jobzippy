import { API_CONFIG } from '@/lib/config';
import type { JobMatch, JobSearchRequest } from './types';

function buildQuery(params: JobSearchRequest): string {
  const search = new URLSearchParams();
  if (params.keywords?.length) {
    search.set('keywords', params.keywords.join(','));
  }
  if (params.locations?.length) {
    search.set('locations', params.locations.join(','));
  }
  if (typeof params.remote === 'boolean') {
    search.set('remote', String(params.remote));
  }
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    search.set('limit', String(Math.max(1, Math.min(50, Math.floor(params.limit)))));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function searchJobs(request: JobSearchRequest): Promise<JobMatch[]> {
  const response = await fetch(`${API_CONFIG.baseUrl}/jobs/search${buildQuery(request)}`);
  if (!response.ok) {
    throw new Error('Failed to fetch job matches');
  }
  const payload = (await response.json()) as { jobs: JobMatch[] };
  return payload.jobs ?? [];
}
