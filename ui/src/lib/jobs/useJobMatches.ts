import { useCallback, useEffect, useMemo, useState } from 'react';

import { deriveVaultPassword } from '@/lib/vault/utils';
import { vaultService } from '@/lib/vault/service';
import { VAULT_STORES } from '@/lib/vault/constants';
import type { History, ProfileVault, UserInfo } from '@/lib/types';
import { searchJobs } from './service';
import type { JobMatch } from './types';

type JobStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseJobMatchesResult {
  jobs: JobMatch[];
  status: JobStatus;
  error: string | null;
  refresh: () => void;
}

function normalizeList(values: string[] | undefined | null): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value) && value.length > 1)
    )
  );
}

function deriveKeywords(
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

function deriveLocations(profile: ProfileVault['profile'] | null): string[] {
  const locations = normalizeList(profile?.preferences?.locations);
  return locations.slice(0, 3);
}

export function useJobMatches(user: UserInfo | null): UseJobMatchesResult {
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [status, setStatus] = useState<JobStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const password = useMemo(() => deriveVaultPassword(user), [user]);

  const fetchJobs = useCallback(async () => {
    if (!user) {
      setJobs([]);
      setStatus('idle');
      setError(null);
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const [profile, history] = await Promise.all([
        vaultService.load(VAULT_STORES.profile, password).catch(() => null),
        vaultService.load(VAULT_STORES.history, password).catch(() => null),
      ]);
      const keywords = deriveKeywords(profile, history);
      const locations = deriveLocations(profile);
      const remotePreference = Boolean(profile?.preferences?.remote);
      const matches = await searchJobs({
        keywords,
        locations,
        remote: remotePreference,
        limit: 12,
      });
      setJobs(matches);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to load jobs');
    }
  }, [password, user]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setJobs([]);
      setStatus('idle');
      setError(null);
      return;
    }
    (async () => {
      await fetchJobs();
      if (cancelled) {
        setJobs((prev) => prev);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchJobs, user]);

  return {
    jobs,
    status,
    error,
    refresh: fetchJobs,
  };
}
