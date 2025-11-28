import { openDB, type DBSchema } from 'idb';
import type { JobRecord } from './store-types';

export const JOBS_DB_NAME = 'JobzippyJobs';
export const JOBS_DB_VERSION = 1;
export const JOBS_STORE_NAME = 'jobs';

interface JobsDBSchema extends DBSchema {
  [JOBS_STORE_NAME]: {
    key: string; // id = `${platform}::${normalizedUrl}`
    value: JobRecord;
    indexes: {
      status: JobRecord['status'];
      'platform-createdAt': [JobRecord['platform'], number];
      'status-updatedAt': [JobRecord['status'], number];
    };
  };
}

const dbPromise = openDB<JobsDBSchema>(JOBS_DB_NAME, JOBS_DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(JOBS_STORE_NAME)) {
      const store = db.createObjectStore(JOBS_STORE_NAME, { keyPath: 'id' });
      
      // Index on status for filtering
      store.createIndex('status', 'status');
      
      // Index on platform + createdAt for sorting
      store.createIndex('platform-createdAt', ['platform', 'createdAt']);
      
      // Index on status + updatedAt for recent in-progress queries
      store.createIndex('status-updatedAt', ['status', 'updatedAt']);
    }
  },
});

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const db = await dbPromise;
  return db.get(JOBS_STORE_NAME, id);
}

export async function putJob(job: JobRecord): Promise<void> {
  const db = await dbPromise;
  await db.put(JOBS_STORE_NAME, job);
}

export async function getAllJobs(): Promise<JobRecord[]> {
  const db = await dbPromise;
  return db.getAll(JOBS_STORE_NAME);
}

export async function getJobsByStatus(status: JobRecord['status']): Promise<JobRecord[]> {
  const db = await dbPromise;
  const index = db.transaction(JOBS_STORE_NAME).store.index('status');
  return index.getAll(status);
}

export async function getJobsByStatuses(statuses: JobRecord['status'][]): Promise<JobRecord[]> {
  const db = await dbPromise;
  // Use index for each status and combine results (more efficient than full scan)
  const results: JobRecord[] = [];
  const seen = new Set<string>();
  
  for (const status of statuses) {
    const index = db.transaction(JOBS_STORE_NAME, 'readonly').store.index('status');
    const jobs = await index.getAll(status);
    for (const job of jobs) {
      if (!seen.has(job.id)) {
        seen.add(job.id);
        results.push(job);
      }
    }
  }
  
  return results;
}

export async function getRecentJobs(limit: number = 50): Promise<JobRecord[]> {
  const db = await dbPromise;
  const tx = db.transaction(JOBS_STORE_NAME, 'readonly');
  const store = tx.store;
  const allJobs = await store.getAll();
  
  // Sort by updatedAt descending and take limit
  return allJobs
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export async function deleteJob(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete(JOBS_STORE_NAME, id);
}

export async function clearAllJobs(): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(JOBS_STORE_NAME, 'readwrite');
  await tx.store.clear();
  await tx.done;
}

