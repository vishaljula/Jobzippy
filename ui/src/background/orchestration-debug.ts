/**
 * Orchestration Debug Logger
 *
 * Captures every step of the orchestration flow for debugging purposes.
 * Use this to compare successful runs vs failed stop/resume runs.
 *
 * Usage:
 * 1. Run the agent without stopping - this captures the "golden path"
 * 2. Export the log: chrome.storage.local.get('orchestrationDebugLog')
 * 3. Clear and run again with stop/resume
 * 4. Compare the logs to identify where things diverge
 *
 * Console helpers:
 * - View log: orchestrationDebug.getLog()
 * - Clear log: orchestrationDebug.clear()
 * - Export to JSON: orchestrationDebug.export()
 */

export interface OrchestrationDebugEntry {
  id: number;
  timestamp: number;
  timestampISO: string;
  runId: string; // Unique ID per orchestration run
  jobId: string | null;
  jobIndex: number | null;
  step: string;
  action: string;
  inputData: any;
  outputData?: any;
  stateSnapshot?: {
    currentJobIndex: number;
    scrapedJobIds: string[];
    atsTabId: number | null;
    currentPage: number;
    hasNextPage: boolean;
  };
  error?: string;
  durationMs?: number;
}

const DEBUG_STORAGE_KEY = 'orchestrationDebugLog';
const MAX_ENTRIES = 500; // Keep last 500 entries to avoid storage bloat

let entryCounter = 0;
let currentRunId: string | null = null;

/**
 * Start a new debug run (call at the beginning of orchestration)
 */
export function startDebugRun(): string {
  currentRunId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[OrchDebug] Starting new run: ${currentRunId}`);
  return currentRunId;
}

/**
 * Log a step execution
 */
export async function logStep(params: {
  jobId: string | null;
  jobIndex: number | null;
  step: string;
  action: string;
  inputData?: any;
  stateSnapshot?: OrchestrationDebugEntry['stateSnapshot'];
}): Promise<number> {
  const entryId = ++entryCounter;
  const now = Date.now();

  const entry: OrchestrationDebugEntry = {
    id: entryId,
    timestamp: now,
    timestampISO: new Date(now).toISOString(),
    runId: currentRunId || 'unknown',
    jobId: params.jobId,
    jobIndex: params.jobIndex,
    step: params.step,
    action: params.action,
    inputData: sanitizeForStorage(params.inputData),
    stateSnapshot: params.stateSnapshot,
  };

  await appendEntry(entry);

  console.log(`[OrchDebug] #${entryId} ${params.step} (job: ${params.jobId || 'N/A'})`);

  return entryId;
}

/**
 * Update a step with its result
 */
export async function logStepResult(
  entryId: number,
  result: {
    outputData?: any;
    error?: string;
    durationMs?: number;
  }
): Promise<void> {
  try {
    const { [DEBUG_STORAGE_KEY]: log = [] } = await chrome.storage.local.get(DEBUG_STORAGE_KEY);

    const entry = log.find((e: OrchestrationDebugEntry) => e.id === entryId);
    if (entry) {
      entry.outputData = sanitizeForStorage(result.outputData);
      entry.error = result.error;
      entry.durationMs = result.durationMs;

      await chrome.storage.local.set({ [DEBUG_STORAGE_KEY]: log });
    }
  } catch (err) {
    console.error('[OrchDebug] Failed to update step result:', err);
  }
}

/**
 * Append an entry to the debug log
 */
async function appendEntry(entry: OrchestrationDebugEntry): Promise<void> {
  try {
    const { [DEBUG_STORAGE_KEY]: log = [] } = await chrome.storage.local.get(DEBUG_STORAGE_KEY);

    log.push(entry);

    // Trim old entries if exceeding max
    if (log.length > MAX_ENTRIES) {
      log.splice(0, log.length - MAX_ENTRIES);
    }

    await chrome.storage.local.set({ [DEBUG_STORAGE_KEY]: log });
  } catch (err) {
    console.error('[OrchDebug] Failed to append entry:', err);
  }
}

/**
 * Get the full debug log
 */
export async function getDebugLog(): Promise<OrchestrationDebugEntry[]> {
  const { [DEBUG_STORAGE_KEY]: log = [] } = await chrome.storage.local.get(DEBUG_STORAGE_KEY);
  return log;
}

/**
 * Clear the debug log
 */
export async function clearDebugLog(): Promise<void> {
  await chrome.storage.local.remove(DEBUG_STORAGE_KEY);
  entryCounter = 0;
  console.log('[OrchDebug] Log cleared');
}

/**
 * Get a summary of the debug log (for quick viewing)
 */
export async function getDebugSummary(): Promise<{
  totalEntries: number;
  runs: { runId: string; startTime: string; stepCount: number; jobsProcessed: string[] }[];
  lastSteps: { step: string; jobId: string | null; timestamp: string }[];
}> {
  const log = await getDebugLog();

  // Group by runId
  const runMap = new Map<string, OrchestrationDebugEntry[]>();
  for (const entry of log) {
    const existing = runMap.get(entry.runId) || [];
    existing.push(entry);
    runMap.set(entry.runId, existing);
  }

  const runs = Array.from(runMap.entries()).map(([runId, entries]) => ({
    runId,
    startTime: entries[0]?.timestampISO || 'unknown',
    stepCount: entries.length,
    jobsProcessed: [...new Set(entries.map((e) => e.jobId).filter(Boolean))] as string[],
  }));

  // Get last 10 steps
  const lastSteps = log.slice(-10).map((e) => ({
    step: e.step,
    jobId: e.jobId,
    timestamp: e.timestampISO,
  }));

  return {
    totalEntries: log.length,
    runs,
    lastSteps,
  };
}

/**
 * Export log as downloadable JSON string
 */
export async function exportDebugLog(): Promise<string> {
  const log = await getDebugLog();
  return JSON.stringify(log, null, 2);
}

/**
 * Compare two runs to find differences
 */
export async function compareRuns(
  runId1: string,
  runId2: string
): Promise<{
  run1Steps: string[];
  run2Steps: string[];
  divergencePoint: number | null;
  run1Only: string[];
  run2Only: string[];
}> {
  const log = await getDebugLog();

  const run1 = log.filter((e) => e.runId === runId1).map((e) => `${e.step}:${e.jobId || 'null'}`);
  const run2 = log.filter((e) => e.runId === runId2).map((e) => `${e.step}:${e.jobId || 'null'}`);

  let divergencePoint: number | null = null;
  for (let i = 0; i < Math.min(run1.length, run2.length); i++) {
    if (run1[i] !== run2[i]) {
      divergencePoint = i;
      break;
    }
  }

  return {
    run1Steps: run1,
    run2Steps: run2,
    divergencePoint,
    run1Only: run1.filter((s) => !run2.includes(s)),
    run2Only: run2.filter((s) => !run1.includes(s)),
  };
}

/**
 * Sanitize data for storage (remove large/circular objects)
 */
function sanitizeForStorage(data: any): any {
  if (!data) return data;

  try {
    // Convert to JSON and back to remove non-serializable items
    const str = JSON.stringify(data, (key, value) => {
      // Skip large binary data
      if (key === 'base64' && typeof value === 'string' && value.length > 1000) {
        return `[BASE64 DATA: ${value.length} chars]`;
      }
      if (key === 'data' && typeof value === 'string' && value.length > 1000) {
        return `[DATA: ${value.length} chars]`;
      }
      // Skip functions
      if (typeof value === 'function') {
        return '[FUNCTION]';
      }
      // Skip HTML elements
      if (value instanceof HTMLElement) {
        return `[HTMLElement: ${value.tagName}]`;
      }
      return value;
    });

    return JSON.parse(str);
  } catch {
    return '[UNSERIALIZABLE]';
  }
}

// Expose helpers to window for console access
if (typeof globalThis !== 'undefined') {
  (globalThis as any).orchestrationDebug = {
    getLog: getDebugLog,
    getSummary: getDebugSummary,
    clear: clearDebugLog,
    export: exportDebugLog,
    compare: compareRuns,
  };
}
