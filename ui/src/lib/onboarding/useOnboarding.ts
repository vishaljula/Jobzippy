import { useState, useEffect, useCallback } from 'react';
import { getStorage, setStorage } from '@/lib/storage';
import type { OnboardingSnapshot, OnboardingStatus } from '@/lib/types';

const DEFAULT_SNAPSHOT: OnboardingSnapshot = {
  status: 'not_started',
  updatedAt: new Date(0).toISOString(),
};

const createSnapshot = (status: OnboardingStatus): OnboardingSnapshot => ({
  status,
  updatedAt: new Date().toISOString(),
});

async function loadSnapshot(): Promise<OnboardingSnapshot> {
  try {
    const stored = await getStorage('onboardingStatus');
    if (stored && typeof stored === 'object' && 'status' in stored) {
      return stored as OnboardingSnapshot;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Onboarding] Failed to load onboarding status', error);
    }
  }
  return DEFAULT_SNAPSHOT;
}

async function persistSnapshot(snapshot: OnboardingSnapshot): Promise<void> {
  try {
    await setStorage('onboardingStatus', snapshot);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[Onboarding] Failed to persist onboarding status', error);
    }
  }
}

export function useOnboarding(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot>(DEFAULT_SNAPSHOT);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);

  useEffect(() => {
    let mounted = true;

    if (!enabled) {
      setSnapshot(DEFAULT_SNAPSHOT);
      setIsLoading(false);
      return () => {
        mounted = false;
      };
    }

    setIsLoading(true);
    loadSnapshot().then((value) => {
      if (!mounted) return;
      setSnapshot(value);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [enabled]);

  const updateStatus = useCallback(
    async (status: OnboardingStatus) => {
      if (!enabled) return;
      const next = createSnapshot(status);
      await persistSnapshot(next);
      setSnapshot(next);
    },
    [enabled]
  );

  const begin = useCallback(async () => {
    if (!enabled) return;
    if (snapshot.status !== 'in_progress') {
      await updateStatus('in_progress');
    }
  }, [enabled, snapshot.status, updateStatus]);

  const complete = useCallback(async () => {
    await updateStatus('completed');
  }, [updateStatus]);

  const skip = useCallback(async () => {
    await updateStatus('skipped');
  }, [updateStatus]);

  const reset = useCallback(async () => {
    await updateStatus('not_started');
  }, [updateStatus]);

  return {
    snapshot,
    isLoading,
    begin,
    complete,
    skip,
    reset,
  } as const;
}
