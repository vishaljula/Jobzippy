import { useCallback, useEffect, useState } from 'react';
import type { JobRecord, JobStats } from './store-types';
import { getDashboardJobs, getJobStats } from './store';

interface UseApplicationsDataResult {
  inProgress: JobRecord[];
  history: JobRecord[];
  stats: JobStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApplicationsData(): UseApplicationsDataResult {
  const [inProgress, setInProgress] = useState<JobRecord[]>([]);
  const [history, setHistory] = useState<JobRecord[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('[useApplicationsData] Loading data from IndexedDB...');

      const [dashboardData, jobStats] = await Promise.all([
        getDashboardJobs(),
        getJobStats(),
      ]);

      console.log('[useApplicationsData] Loaded data:', {
        inProgress: dashboardData.inProgress.length,
        history: dashboardData.history.length,
        stats: jobStats,
      });

      // Ensure no duplicates when loading (defensive)
      const uniqueInProgress = Array.from(
        new Map(dashboardData.inProgress.map((job) => [job.id, job])).values()
      );
      const uniqueHistory = Array.from(
        new Map(dashboardData.history.map((job) => [job.id, job])).values()
      );

      setInProgress(uniqueInProgress);
      setHistory(uniqueHistory);
      setStats(jobStats);
    } catch (err) {
      console.error('[useApplicationsData] Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load job data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodically refresh data as fallback (in case messages are missed)
  // Reduced frequency to 30 seconds to avoid unnecessary DB scans
  useEffect(() => {
    if (isLoading) return;

    const interval = setInterval(() => {
      console.log('[useApplicationsData] Periodic refresh');
      loadData();
    }, 30000); // Refresh every 30 seconds as fallback (was 5s)

    return () => clearInterval(interval);
  }, [loadData, isLoading]);

  // Listen for live updates from background worker
  useEffect(() => {
    console.log('[useApplicationsData] Setting up message listener');
    const handler = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ) => {
      console.log('[useApplicationsData] Received message:', message);
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'DASHBOARD_JOB_UPDATED' &&
        'data' in message &&
        message.data
      ) {
        const updatedJob = message.data as JobRecord;
        console.log('[useApplicationsData] Processing job update:', updatedJob.id, updatedJob.status);

        // Update in-memory state - ensure no duplicates by using Set or Map
        setInProgress((prev) => {
          // Remove duplicate first, then add/update
          const withoutDuplicate = prev.filter((j) => j.id !== updatedJob.id);

          if (['queued', 'applying', 'ats_filling'].includes(updatedJob.status)) {
            // Add or update in-progress job
            return [updatedJob, ...withoutDuplicate].sort((a, b) => b.updatedAt - a.updatedAt);
          }
          // If moved to history, remove from in-progress
          return withoutDuplicate;
        });

        setHistory((prev) => {
          // Remove duplicate first, then add/update
          const withoutDuplicate = prev.filter((j) => j.id !== updatedJob.id);

          if (['completed', 'failed', 'skipped'].includes(updatedJob.status)) {
            // Add or update history job
            return [updatedJob, ...withoutDuplicate].sort((a, b) => b.updatedAt - a.updatedAt);
          }
          // If moved to in-progress, remove from history
          return withoutDuplicate;
        });

        // Update stats incrementally (more efficient than full recalculation)
        setStats((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };

          // Find old status to decrement
          const oldInProgress = inProgress.find((j) => j.id === updatedJob.id);
          const oldHistory = history.find((j) => j.id === updatedJob.id);
          const oldStatus = oldInProgress?.status || oldHistory?.status;

          if (oldStatus && oldStatus !== updatedJob.status) {
            updated[oldStatus] = Math.max(0, (updated[oldStatus] ?? 0) - 1);
          }

          // Increment new status
          updated[updatedJob.status] = (updated[updatedJob.status] ?? 0) + 1;

          return updated;
        });
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, []);

  return {
    inProgress,
    history,
    stats,
    isLoading,
    error,
    refresh: loadData,
  };
}

