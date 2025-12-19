import type { History, ProfileVault } from '@/lib/types';

function normalizeList(values: string[] | undefined | null): string[] {
  if (!values || values.length === 0) return [];
  return Array.from(
    new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v) && v.length > 1))
  );
}

export function deriveKeywords(
  _profile: ProfileVault['profile'] | null,
  history: History | null
): string[] {
  const keywords = new Set<string>();
  if (history?.employment?.length) {
    const sorted = [...history.employment].sort(
      (a, b) => new Date(b.end ?? Date.now()).getTime() - new Date(a.end ?? Date.now()).getTime()
    );
    if (sorted[0]?.title) {
      keywords.add(sorted[0].title);
    }
  }
  if (!keywords.size) {
    keywords.add('Product Manager');
  }
  return Array.from(keywords).slice(0, 3);
}

export function deriveLocations(profile: ProfileVault['profile'] | null): string[] {
  const locations = normalizeList(profile?.preferences?.locations);
  return locations.slice(0, 3);
}

export interface SearchUrls {
  linkedin?: string;
  indeed?: string;
}

// Platform configuration for mock pages
const MOCK_PLATFORMS = [
  { name: 'linkedin', mockPath: 'linkedin-jobs.html' },
  { name: 'indeed', mockPath: 'indeed-jobs.html' },
] as const;

const MOCK_SERVER_PORT = import.meta.env.VITE_MOCK_PORT || '3000';
const MOCK_SERVER_URL = `http://localhost:${MOCK_SERVER_PORT}`;

export function buildSearchUrls(
  profile: ProfileVault['profile'] | null,
  history: History | null
): SearchUrls {
  // Check if we should use mock pages (dev mode by default, or explicit override)
  const useMockPages =
    import.meta.env.VITE_USE_MOCK_PAGES === 'true'
      ? true
      : import.meta.env.VITE_USE_MOCK_PAGES === 'false'
        ? false
        : import.meta.env.MODE === 'development' || import.meta.env.DEV; // Default: true in dev, false in prod

  console.log(
    '[Jobzippy] buildSearchUrls - useMockPages:',
    useMockPages,
    'MODE:',
    import.meta.env.MODE,
    'DEV:',
    import.meta.env.DEV
  );

  if (useMockPages) {
    // Build localhost URLs dynamically from platform config
    const urls: SearchUrls = {};
    for (const platform of MOCK_PLATFORMS) {
      const mockUrl = `${MOCK_SERVER_URL}/mocks/${platform.mockPath}`;
      if (platform.name === 'linkedin') {
        urls.linkedin = mockUrl;
      } else if (platform.name === 'indeed') {
        urls.indeed = mockUrl;
      }
    }
    console.log('[Jobzippy] Using mock URLs:', urls);
    return urls;
  }

  console.log('[Jobzippy] Using real URLs (useMockPages:', useMockPages, ')');

  const titles = deriveKeywords(profile, history);
  const locations = deriveLocations(profile);
  const remote = Boolean(profile?.preferences?.remote);
  const salaryMin = profile?.preferences?.salary_min;

  const linkedin = buildLinkedInUrl(titles, locations, remote);
  const indeed = buildIndeedUrl(titles, locations, remote, salaryMin);
  return { linkedin, indeed };
}

function buildLinkedInUrl(titles: string[], locations: string[], remote: boolean): string {
  const base = 'https://www.linkedin.com/jobs/search/?';
  const params = new URLSearchParams();
  if (titles.length) params.set('keywords', titles.join(' OR '));
  if (locations.length && locations[0]) params.set('location', locations[0]);
  if (remote) params.set('f_WT', '2'); // LinkedIn remote filter
  return base + params.toString();
}

function buildIndeedUrl(
  titles: string[],
  locations: string[],
  remote: boolean,
  salaryMin?: number
): string {
  const base = 'https://www.indeed.com/jobs?';
  const params = new URLSearchParams();
  if (titles.length) params.set('q', titles.join(' OR '));
  if (locations.length && locations[0]) params.set('l', locations[0]);
  if (remote) params.set('remotejob', '1');
  if (salaryMin && Number.isFinite(salaryMin)) {
    // Indeed salary filter is coarse; this is a hint and may not always apply precisely
    params.set('salary', String(Math.max(0, Math.floor(salaryMin))));
  }
  return base + params.toString();
}
