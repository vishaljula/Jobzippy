# Dashboard Data Architecture

## Overview

The dashboard displays real-time job application data sourced from IndexedDB, with live updates pushed from the background worker. This document describes the data model, storage strategy, and update flow.

## Data Model

### IndexedDB Schema

**Store Name:** `jobs`

**Primary Key:** `id` (string) = `${platform}::${normalizedUrl}`

**Record Shape:**

```typescript
type JobStatus = "queued" | "applying" | "ats_filling" | "completed" | "failed" | "skipped";

interface JobRecord {
  id: string;                // `${platform}::${normalizedUrl}`
  platform: "linkedin" | "indeed" | string;
  normalizedUrl: string;     // cleaned URL (no query params, no trailing slash)
  rawUrl: string;            // original URL as found

  title: string;
  company: string;
  location?: string;

  status: JobStatus;
  attempts: number;           // number of times we've tried to apply

  createdAt: number;          // timestamp when first queued
  updatedAt: number;         // timestamp of last update
  lastAppliedAt?: number;    // timestamp of last application attempt
  errorMessage?: string;     // error details if failed

  // Optional tracking fields
  sourceTabId?: number;       // tab that initiated the job
  atsTabId?: number;         // ATS tab ID if external
  applyType?: 'easy_apply' | 'external';
}
```

### Indexes

1. **`status`** - For filtering by status (dashboard tabs)
2. **`[platform, createdAt]`** - For sorting by platform and date
3. **`[status, updatedAt]`** - For efficient "recent in-progress" queries

## URL Normalization

**Rules:**
1. Remove query parameters (e.g., `?refId=xyz&tracking=abc`)
2. Remove trailing slashes
3. Preserve path and domain

**Example:**
- Input: `https://www.linkedin.com/jobs/view/123456?refId=xyz&tracking=abc`
- Normalized: `https://www.linkedin.com/jobs/view/123456`

## Duplicate Detection

**Strategy:**
1. Before enqueueing a job, normalize the URL
2. Build `id = ${platform}::${normalizedUrl}`
3. Query IndexedDB: `getByKey(id)`
4. If record exists:
   - If status is `completed` or `rejected` → skip (already processed)
   - If status is `applying`, `ats_filling`, or `failed` → update record (retry)
5. If not exists → create new record

**Cross-platform behavior:**
- LinkedIn and Indeed URLs are different, so they naturally become different jobs
- No fingerprint-based blocking across platforms
- Optional `fingerprint` field (normalized `company + title + location`) for UI-only "Possible duplicate" warnings

## State Machine

```
queued → applying → ats_filling → completed | failed | skipped
```

**Transitions:**
- `queued`: Job added to queue
- `applying`: LinkedIn modal opened or Easy Apply started
- `ats_filling`: External ATS tab opened, form filling in progress
- `completed`: Application submitted successfully
- `failed`: Timeout, error, or rejection
- `skipped`: User skipped or filter excluded

## Write Strategy (Option A)

**On every state transition:**
1. Update `status` field
2. Increment `attempts` if retrying
3. Update `updatedAt` timestamp
4. Set `lastAppliedAt` if starting application
5. Set `errorMessage` if failed
6. Write to IndexedDB (upsert by `id`)

**Performance:**
- ~3-5 writes per job lifecycle
- Each write: ~1-3ms
- Total for 2000 jobs: ~6,000-10,000 writes (spread over time)

## Background Worker Role

1. **In-memory queue:** Holds job IDs to process
2. **State tracking:** Updates `jobSessions` Map as jobs progress
3. **IndexedDB writes:** Persists every state transition
4. **Message broadcasting:** Sends `DASHBOARD_JOB_UPDATED` to sidepanel on each update

**Message Format:**
```typescript
{
  type: 'DASHBOARD_JOB_UPDATED',
  data: {
    id: string,
    status: JobStatus,
    // ... other updated fields
  }
}
```

## Dashboard Data Source

**Initial Load:**
1. Read all records from IndexedDB `jobs` store
2. Filter by status for tabs:
   - "In Progress / Up Next": `status in ["queued", "applying", "ats_filling"]`
   - "History": `status in ["completed", "failed", "skipped"]`
3. Sort by `updatedAt` descending

**Live Updates:**
1. Listen for `DASHBOARD_JOB_UPDATED` messages from background
2. Merge updates into in-memory list (upsert by `id`)
3. Re-render affected components

**Fallback:**
- If IndexedDB is empty → show demo/empty state
- If read fails → show error with retry button

## Performance Considerations

**IndexedDB Query Performance:**
- Single-key lookup: ~1-5ms for 2,000 records
- Indexed range queries: ~5-20ms
- Full table scan: ~50-100ms (avoid if possible)

**Optimizations:**
- Use indexes for all queries
- Debounce rapid status updates (if needed)
- Cache dashboard stats in memory, refresh on updates

## Storage Estimates

**Per Record:**
- Average size: ~1.5-2.5 KB (with all fields populated)
- 2,000 records: ~3-5 MB
- Well within Chrome's ~100 MB per-origin quota

## Migration & Compatibility

**Initial Setup:**
- Create `jobs` store on first run
- Add indexes during database upgrade
- No migration needed (new feature)

**Future Enhancements:**
- Add `fingerprint` field for duplicate detection UI
- Add `tags` or `categories` for filtering
- Add `matchScore` for relevance sorting

