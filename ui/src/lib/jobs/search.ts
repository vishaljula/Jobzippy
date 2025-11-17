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

export function buildSearchUrls(
  profile: ProfileVault['profile'] | null,
  history: History | null
): SearchUrls {
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
