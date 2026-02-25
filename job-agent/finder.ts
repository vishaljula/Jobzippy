/**
 * finder.ts — Finds frontend engineer jobs via Greenhouse public Job Board API.
 *
 * Greenhouse's job board API requires NO authentication for GET requests.
 * We query several well-known tech companies' boards, aggregate, filter to
 * frontend roles, and return the best 2 with their direct apply URLs.
 *
 * Apply form URL pattern: https://boards.greenhouse.io/{company}/jobs/{jobId}
 * These are clean, accessible forms — good a11y tree, no login required.
 */

import type { AgentProfile, ScrapedJob } from './types.js';

// Companies to search across. All on Greenhouse. Add/remove freely.
// Must be the exact slug used in boards.greenhouse.io/{slug}
const GREENHOUSE_COMPANIES = [
    'airbnb',
    'stripe',
    'figma',
    'notion',
    'linear',
    'vercel',
    'openai',
    'anthropic',
    'discord',
    'brex',
    'rippling',
    'robinhood',
    'coinbase',
    'plaid',
    'retool',
];

interface GreenhouseJob {
    id: number;
    title: string;
    absolute_url: string;
    location: { name: string };
    updated_at: string;
}

interface GreenhouseResponse {
    jobs: GreenhouseJob[];
}

async function fetchGreenhouseJobs(companySlug: string): Promise<GreenhouseJob[]> {
    try {
        const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=false`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = (await res.json()) as GreenhouseResponse;
        return data.jobs ?? [];
    } catch {
        return [];
    }
}

/** Returns true if the job title looks like a frontend/UI role matching the profile */
function isMatchingRole(title: string, targetRoles: string[]): boolean {
    const t = title.toLowerCase();

    // Must be frontend/UI related
    const isFrontend =
        t.includes('frontend') ||
        t.includes('front-end') ||
        t.includes('front end') ||
        t.includes('ui engineer') ||
        t.includes('react') ||
        t.includes('web engineer') ||
        t.includes('javascript') ||
        t.includes('typescript');

    if (!isFrontend) return false;

    // Prefer senior/lead level
    const isSenior =
        t.includes('senior') ||
        t.includes('sr.') ||
        t.includes('lead') ||
        t.includes('staff') ||
        t.includes('principal');

    // Also check against profile target roles
    const matchesTarget = targetRoles.some((role) =>
        t.includes(role.toLowerCase().split(' ').slice(-1)[0]) // match last keyword e.g. "Engineer"
    );

    return isSenior || matchesTarget;
}

/**
 * Fetches fresh frontend engineer job listings from multiple Greenhouse boards.
 * Returns up to `maxJobs` jobs, sorted by recency.
 */
export async function findJobs(
    _stagehand: unknown, // kept for API compatibility but not used — no browser needed
    profile: AgentProfile,
    maxJobs = 2
): Promise<ScrapedJob[]> {
    console.log('\n🔍 Fetching jobs from Greenhouse job boards (no login required)...');

    const targetRoles = profile.preferences.target_roles ?? ['Senior Frontend Engineer'];

    // Fetch from all companies in parallel
    const results = await Promise.allSettled(
        GREENHOUSE_COMPANIES.map(async (slug) => {
            const jobs = await fetchGreenhouseJobs(slug);
            return jobs.map((j) => ({ ...j, company: slug }));
        })
    );

    const allJobs = results
        .filter((r): r is PromiseFulfilledResult<(GreenhouseJob & { company: string })[]> =>
            r.status === 'fulfilled'
        )
        .flatMap((r) => r.value);

    console.log(`  Fetched ${allJobs.length} total jobs across ${GREENHOUSE_COMPANIES.length} companies`);

    // Filter to matching roles
    const matched = allJobs.filter((j) => isMatchingRole(j.title, targetRoles));
    console.log(`  ${matched.length} matched frontend/senior roles`);

    if (matched.length === 0) {
        // Broaden search — take any frontend role
        const fallback = allJobs.filter((j) => {
            const t = j.title.toLowerCase();
            return t.includes('frontend') || t.includes('front-end') || t.includes('react');
        });
        console.log(`  Broadened to ${fallback.length} frontend roles`);
        matched.push(...fallback);
    }

    // Sort by most recently updated
    matched.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Convert to ScrapedJob format and take top N
    const selected = matched.slice(0, maxJobs).map((j): ScrapedJob => ({
        title: j.title,
        company: j.company.charAt(0).toUpperCase() + j.company.slice(1), // capitalize
        location: j.location?.name ?? 'Remote',
        url: j.absolute_url, // direct Greenhouse apply link
        description: '', // we'll fetch description during apply
        isEasyApply: true, // Greenhouse forms are direct — no redirect
    }));

    console.log(`\n✅ Selected ${selected.length} job(s):`);
    selected.forEach((j, i) =>
        console.log(`  ${i + 1}. ${j.title} @ ${j.company} — ${j.url}`)
    );

    return selected;
}
