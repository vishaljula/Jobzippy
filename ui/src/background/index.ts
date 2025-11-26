/**
 * Background Service Worker
 * Handles extension lifecycle, messaging, and orchestration
 */

// import { vaultService } from '../lib/vault/service';
// import { VAULT_STORES } from '../lib/vault/constants';
import { deriveVaultPassword } from '../lib/vault/utils';
import { backgroundVaultService, STORES } from './vault-service-worker';
import type {
  JobSession,
  ApplyJobStartMessage,
  LinkedInModalDetectedMessage,
  JobCompletedMessage,
  ExternalATSOpenedMessage,
  ExternalATSDoneMessage,
  FillExternalATSMessage,
  ATSContentScriptReadyMessage,
  ATSCompleteMessage,
  ATSNavigationStartingMessage,
} from '../types/job-session';
// import { logger } from '../lib/logger'; // Disabled to prevent Service Worker crash

// logger.log('Background', 'Background service worker initialized');
console.log('[Jobzippy] Background service worker initialized');

// Helper to log to content scripts (which can write to agent-logs.txt)
async function logToContentScripts(component: string, message: string, data?: any) {
  console.log(`[${component}] ${message}`, data || '');

  // Try to send to all content scripts so they can log it
  try {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.url && (tab.url.includes('linkedin') || tab.url.includes('localhost'))) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'LOG_MESSAGE',
              data: { component, message, data },
            })
            .catch(() => {});
        }
      });
    });
  } catch (e) {
    // Ignore errors
  }
}

// -----------------------------------------------------------------------------
// Lightweight Engine State (Story 1: Start/Stop lifecycle)
// -----------------------------------------------------------------------------
type EngineState = 'IDLE' | 'RUNNING' | 'PAUSED';
let engineState: EngineState = 'IDLE';
let engineStatus: string = 'Idle';

// -----------------------------------------------------------------------------
// JobSession - Single Source of Truth
// -----------------------------------------------------------------------------
const jobSessions = new Map<string, JobSession>(); // keyed by jobId

// -----------------------------------------------------------------------------
// Timeout Registry - Track all active timeouts per jobId
// -----------------------------------------------------------------------------
const timeoutRegistry = new Map<string, Set<number>>(); // jobId -> Set<timerId>

/**
 * Clear all timeouts for a jobId
 */
function clearAllTimeoutsForJob(jobId: string): void {
  const timeouts = timeoutRegistry.get(jobId);
  if (timeouts && timeouts.size > 0) {
    const timeoutCount = timeouts.size;
    const timerIds = Array.from(timeouts);
    timeouts.forEach((timerId) => {
      clearTimeout(timerId);
    });
    timeouts.clear();
    console.log(
      `[Jobzippy] [TIMEOUT] Cleared ${timeoutCount} timeout(s) from registry for jobId=${jobId}:`,
      timerIds
    );
    logToContentScripts(
      'Background',
      `[TIMEOUT] Cleared ${timeoutCount} timeout(s) from registry`,
      { jobId, timerIds }
    );
  } else {
    console.log(
      `[Jobzippy] [TIMEOUT] No timeouts to clear for jobId=${jobId} (registry empty or not found)`
    );
  }
}

/**
 * Register a timeout for a jobId
 */
function registerTimeout(jobId: string, timerId: number): void {
  if (!timeoutRegistry.has(jobId)) {
    timeoutRegistry.set(jobId, new Set());
  }
  timeoutRegistry.get(jobId)!.add(timerId);
  console.log(
    `[Jobzippy] [TIMEOUT] Registered timeout ${timerId} for jobId=${jobId}, total active timeouts: ${timeoutRegistry.get(jobId)!.size}`
  );
}

/**
 * Unregister a timeout for a jobId
 */
function unregisterTimeout(jobId: string, timerId: number): void {
  const timeouts = timeoutRegistry.get(jobId);
  if (timeouts) {
    timeouts.delete(timerId);
    console.log(
      `[Jobzippy] [TIMEOUT] Unregistered timeout ${timerId} for jobId=${jobId}, remaining active timeouts: ${timeouts.size}`
    );
    if (timeouts.size === 0) {
      timeoutRegistry.delete(jobId);
    }
  }
}

/**
 * Helper to check if URL matches ATS pattern (production-ready)
 */
function isATSUrl(url: string): boolean {
  // Production ATS platforms (domain-based detection)
  const atsDomains = [
    'greenhouse.io',
    'greenhouse.com',
    'workday.com',
    'lever.co',
    'smartrecruiters.com',
    'apply.workable.com',
    'jobs.lever.co',
    'icims.com',
    'taleo.net',
    'ashbyhq.com',
    'jobvite.com',
  ];

  // Check if URL contains any ATS domain
  if (atsDomains.some((domain) => url.includes(domain))) {
    return true;
  }

  // For development: detect localhost mocks
  // Check for /mocks/ path OR ATS names in path (e.g., greenhouse-apply.html, workday-form.html)
  if (url.startsWith('http://localhost:')) {
    const atsNames = [
      'greenhouse',
      'workday',
      'lever',
      'smartrecruiters',
      'icims',
      'taleo',
      'ashbyhq',
      'jobvite',
      'motion-recruitment',
    ];
    const hasMocksPath = url.includes('/mocks/');
    const hasAtsNameInPath = atsNames.some((name) => url.toLowerCase().includes(name));
    return hasMocksPath || hasAtsNameInPath;
  }

  return false;
}

/**
 * Find job session by source tab ID
 */
function findJobSessionBySourceTab(sourceTabId: number): JobSession | undefined {
  for (const session of jobSessions.values()) {
    if (session.sourceTabId === sourceTabId && session.status === 'pending') {
      return session;
    }
  }
  return undefined;
}

/**
 * Find job session by ATS tab ID
 */
function findJobSessionByATSTab(atsTabId: number): JobSession | undefined {
  for (const session of jobSessions.values()) {
    if (session.atsTabId === atsTabId) {
      return session;
    }
  }
  return undefined;
}

/**
 * Handle ATS timeout
 */
function handleATSTimeout(jobId: string, source: string, expectedTimerId?: number): void {
  const session = jobSessions.get(jobId);
  if (!session) {
    console.warn(
      `[Jobzippy] [TIMEOUT] handleATSTimeout called but no session found for jobId=${jobId}, source=${source}`
    );
    logToContentScripts('Background', `[TIMEOUT] handleATSTimeout called but no session found`, {
      jobId,
      source,
    });
    return;
  }

  // Defensive check: If expectedTimerId is provided, verify it matches current timerId
  // This prevents old/stale timeouts from firing
  const stackTrace = new Error().stack;
  console.log(
    `[Jobzippy] [TIMEOUT] handleATSTimeout called: jobId=${jobId}, source=${source}, expectedTimerId=${expectedTimerId}, session.timerId=${session.timerId}`
  );
  console.log(`[Jobzippy] [TIMEOUT] Stack trace:`, stackTrace);
  logToContentScripts('Background', `[TIMEOUT] handleATSTimeout called`, {
    jobId,
    source,
    expectedTimerId,
    sessionTimerId: session.timerId,
    stackTrace,
  });

  if (expectedTimerId !== undefined && session.timerId !== expectedTimerId) {
    console.warn(
      `[Jobzippy] [TIMEOUT] Stale timeout fired! Expected timerId=${expectedTimerId}, but current timerId=${session.timerId}, jobId=${jobId}, source=${source}`
    );
    logToContentScripts('Background', `[TIMEOUT] Stale timeout ignored`, {
      jobId,
      source,
      expectedTimerId,
      currentTimerId: session.timerId,
    });
    // Unregister the stale timeout
    if (expectedTimerId !== undefined) {
      unregisterTimeout(jobId, expectedTimerId);
    }
    return; // Ignore stale timeout
  }

  const timeoutInfo = {
    jobId,
    source,
    sessionStatus: session.status,
    atsTabId: session.atsTabId,
    sourceTabId: session.sourceTabId,
    elapsedMs: Date.now() - session.startedAt,
    timerId: session.timerId,
  };

  console.log(`[Jobzippy] [TIMEOUT] ATS timeout FIRED for job ${jobId}`, timeoutInfo);
  logToContentScripts('Background', `[TIMEOUT] ATS timeout FIRED for job ${jobId}`, timeoutInfo);

  session.status = 'failed';
  session.result = {
    success: false,
    error: `ATS timeout/failure (source: ${source})`,
  };

  // Clear ALL timeouts for this job (defensive - ensure no stale timeouts remain)
  clearAllTimeoutsForJob(jobId);
  session.timerId = undefined;

  // Notify LinkedIn tab
  console.log(
    `[Jobzippy] [TIMEOUT] Sending EXTERNAL_ATS_DONE to LinkedIn tab: jobId=${jobId}, sourceTabId=${session.sourceTabId}`
  );
  logToContentScripts('Background', `[TIMEOUT] Sending EXTERNAL_ATS_DONE`, {
    jobId,
    sourceTabId: session.sourceTabId,
  });
  chrome.tabs
    .sendMessage(session.sourceTabId, {
      type: 'EXTERNAL_ATS_DONE',
      data: {
        jobId: session.jobId,
        success: false,
        error: `ATS timeout/failure (source: ${source})`,
      },
    })
    .catch(() => {});

  // Close ATS tab
  if (session.atsTabId) {
    chrome.tabs.remove(session.atsTabId).catch(() => {});
  }

  // Cleanup
  clearAllTimeoutsForJob(jobId); // Clear any remaining timeouts
  jobSessions.delete(jobId);
}

// -----------------------------------------------------------------------------
// Story 4 & 5: Search Iteration, Queue & Processing
// -----------------------------------------------------------------------------
interface JobQueueItem {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  platform: 'LinkedIn' | 'Indeed';
  applyType?: 'easy_apply' | 'external' | 'unknown';
}

interface PlatformState {
  platform: 'LinkedIn' | 'Indeed';
  tabId: number | null;
  currentPage: number;
  jobsScraped: number;
  jobsProcessed: number;
  hasNextPage: boolean;
  searchUrl: string | null;
  isActive: boolean;
  // Story 5: Job Queue
  jobQueue: JobQueueItem[];
  isProcessingJob: boolean;
}

interface DailyLimits {
  date: string; // YYYY-MM-DD
  total: number;
  linkedin: number;
  indeed: number;
}

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_PLATFORM_LIMIT = 25;

const platformStates: Map<'LinkedIn' | 'Indeed', PlatformState> = new Map([
  [
    'LinkedIn',
    {
      platform: 'LinkedIn',
      tabId: null,
      currentPage: 0,
      jobsScraped: 0,
      jobsProcessed: 0,
      hasNextPage: false,
      searchUrl: null,
      isActive: false,
      jobQueue: [],
      isProcessingJob: false,
    },
  ],
  [
    'Indeed',
    {
      platform: 'Indeed',
      tabId: null,
      currentPage: 0,
      jobsScraped: 0,
      jobsProcessed: 0,
      hasNextPage: false,
      searchUrl: null,
      isActive: false,
      jobQueue: [],
      isProcessingJob: false,
    },
  ],
]);

let dailyLimits: DailyLimits | null = null;

// Load or initialize daily limits
async function loadDailyLimits(): Promise<DailyLimits> {
  const today = new Date().toISOString().split('T')[0] || new Date().toISOString().substring(0, 10);
  const stored = await chrome.storage.local.get('dailyLimits');
  if (stored.dailyLimits && stored.dailyLimits.date === today) {
    return stored.dailyLimits as DailyLimits;
  }
  // Reset for new day
  const limits: DailyLimits = {
    date: today,
    total: 0,
    linkedin: 0,
    indeed: 0,
  };
  await chrome.storage.local.set({ dailyLimits: limits });
  return limits;
}

// Check if we've hit daily or platform limits
function checkLimits(platform: 'LinkedIn' | 'Indeed'): { canContinue: boolean; reason?: string } {
  if (!dailyLimits) return { canContinue: true };

  // Check daily total limit
  if (dailyLimits.total >= DEFAULT_DAILY_LIMIT) {
    return { canContinue: false, reason: 'Daily limit reached' };
  }

  // Check platform-specific limit
  const platformCount = platform === 'LinkedIn' ? dailyLimits.linkedin : dailyLimits.indeed;
  if (platformCount >= DEFAULT_PLATFORM_LIMIT) {
    return { canContinue: false, reason: `${platform} limit reached` };
  }

  return { canContinue: true };
}

// Initialize daily limits on startup
loadDailyLimits().then((limits) => {
  dailyLimits = limits;
});

function broadcastEngineState() {
  const linkedinState = platformStates.get('LinkedIn');
  const indeedState = platformStates.get('Indeed');
  chrome.runtime
    .sendMessage({
      type: 'ENGINE_STATE',
      data: {
        state: engineState,
        status: engineStatus,
        ts: Date.now(),
        jobsScraped: (linkedinState?.jobsScraped || 0) + (indeedState?.jobsScraped || 0),
        jobsProcessed: (linkedinState?.jobsProcessed || 0) + (indeedState?.jobsProcessed || 0),
        dailyLimit: dailyLimits?.total || 0,
        platformLimit: linkedinState?.isActive
          ? dailyLimits?.linkedin || 0
          : indeedState?.isActive
            ? dailyLimits?.indeed || 0
            : 0,
      },
    })
    .catch(() => {});
}

async function startEngine() {
  if (engineState === 'RUNNING') return;
  engineState = 'RUNNING';
  engineStatus = 'Starting…';
  dailyLimits = await loadDailyLimits();
  broadcastEngineState();

  // Start iteration for each platform
  // The UI will have already opened tabs with search URLs
  // We'll find those tabs and start scraping
  await new Promise<void>((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        const isLinkedInMock =
          tab.url.startsWith('http://localhost:') && tab.url.includes('linkedin-jobs.html');
        if (tab.url.includes('linkedin.com/jobs') || isLinkedInMock) {
          const state = platformStates.get('LinkedIn');
          if (state) {
            state.tabId = tab.id;
            state.searchUrl = tab.url;
            state.isActive = true;
            state.currentPage = 1;
            state.jobQueue = [];
            state.isProcessingJob = false;

            // Content scripts auto-inject via manifest
            // Wait for tab to be ready via tabs.onUpdated event (event-driven)
            // Send messages immediately - content script will handle if not ready
            chrome.tabs.sendMessage(tab.id!, { type: 'AUTH_PROBE' }).catch(() => {});
            // Note: We don't send SCRAPE_JOBS here if START_AGENT is about to be sent
            // The START_AGENT command triggers AgentController which handles scraping
          }
        } else {
          const isIndeedMock =
            tab.url.startsWith('http://localhost:') && tab.url.includes('indeed-jobs.html');
          if ((tab.url.includes('indeed.com') && tab.url.includes('jobs')) || isIndeedMock) {
            console.log('[Jobzippy] Found Indeed tab:', tab.url, 'tabId:', tab.id);
            const state = platformStates.get('Indeed');
            if (state) {
              state.tabId = tab.id;
              state.searchUrl = tab.url;
              state.isActive = true;
              state.currentPage = 1;
              state.jobQueue = [];
              state.isProcessingJob = false;

              // Content scripts auto-inject via manifest
              // Wait for tab to be ready via tabs.onUpdated event (event-driven)
              // Send messages immediately - content script will handle if not ready
              console.log('[Jobzippy] Sending AUTH_PROBE to Indeed tab:', tab.id);
              chrome.tabs.sendMessage(tab.id!, { type: 'AUTH_PROBE' }).catch((err) => {
                console.error('[Jobzippy] Error sending AUTH_PROBE to Indeed:', err);
              });
            } else {
              console.error('[Jobzippy] Indeed state not found in platformStates');
            }
          }
        }
      }
      resolve();
    });
  });

  // Status updates are now event-driven (no polling)
  // Status is updated when jobs are scraped/processed via message handlers
}

function stopEngine() {
  if (engineState === 'IDLE') return;
  engineState = 'IDLE';
  engineStatus = 'Stopped';
  // Reset platform states
  platformStates.forEach((state) => {
    state.isActive = false;
    state.currentPage = 0;
    state.jobQueue = [];
    state.isProcessingJob = false;
  });
  broadcastEngineState();
}

// Process the next job in the queue
async function processJobQueue(platform: 'LinkedIn' | 'Indeed') {
  const state = platformStates.get(platform);
  if (!state || !state.isActive || engineState !== 'RUNNING' || !state.tabId) return;

  if (state.isProcessingJob) {
    console.log(`[Jobzippy] ${platform}: Already processing a job, waiting...`);
    return;
  }

  if (state.jobQueue.length === 0) {
    // Queue empty, check if we should navigate to next page
    console.log(`[Jobzippy] ${platform}: Job queue empty`);
    if (state.hasNextPage) {
      // Navigate immediately (event-driven - no arbitrary delays)
      if (engineState === 'RUNNING' && state.isActive && state.tabId) {
        console.log(`[Jobzippy] ${platform}: Sending NAVIGATE_NEXT_PAGE command`);
        chrome.tabs.sendMessage(state.tabId, { type: 'NAVIGATE_NEXT_PAGE' }).catch((err) => {
          console.error(`[Jobzippy] Error navigating ${platform} to next page:`, err);
        });
      }
    } else {
      console.log(`[Jobzippy] ${platform}: No more pages, iteration complete`);
      state.isActive = false;
      engineStatus = `${platform}: Finished`;
      broadcastEngineState();
    }
    return;
  }

  // Dequeue next job
  const job = state.jobQueue.shift();
  if (!job) return;

  state.isProcessingJob = true;
  console.log(`[Jobzippy] ${platform}: Processing job ${job.id} (${job.title})`);
  engineStatus = `Checking: ${job.title}`;
  broadcastEngineState();

  // Send command to click job card
  try {
    chrome.tabs.sendMessage(state.tabId, {
      type: 'CLICK_JOB_CARD',
      data: { jobId: job.id, platform },
    });

    // Note: Timeout handling is now event-driven via JOB_DETAILS_LOADED message
    // If no response received, job will be skipped when next job completes
  } catch (err) {
    console.error(`[Jobzippy] ${platform}: Error sending CLICK_JOB_CARD:`, err);
    state.isProcessingJob = false;
    processJobQueue(platform);
  }
}

// Handle job scraping results and pagination
async function handleJobsScraped(
  platform: 'LinkedIn' | 'Indeed',
  jobs: JobQueueItem[],
  hasNextPage: boolean,
  currentPage: number
) {
  const state = platformStates.get(platform);
  if (!state || !state.isActive || engineState !== 'RUNNING') return;

  state.jobsScraped += jobs.length;
  state.hasNextPage = hasNextPage;
  state.currentPage = currentPage;

  console.log(
    `[Jobzippy] ${platform}: Scraped ${jobs.length} jobs (page ${currentPage}, total: ${state.jobsScraped})`
  );

  // Check limits before continuing
  const limitCheck = checkLimits(platform);
  if (!limitCheck.canContinue) {
    console.log(`[Jobzippy] ${platform}: ${limitCheck.reason}, stopping iteration`);
    state.isActive = false;
    engineStatus = `${platform}: ${limitCheck.reason}`;
    broadcastEngineState();
    return;
  }

  // Add jobs to queue
  state.jobQueue.push(...jobs);
  console.log(
    `[Jobzippy] ${platform}: Added ${jobs.length} jobs to queue. Queue size: ${state.jobQueue.length}`
  );

  // Start processing queue
  processJobQueue(platform);
}

// Handle page navigation completion
function handlePageNavigated(platform: 'LinkedIn' | 'Indeed') {
  const state = platformStates.get(platform);
  if (!state || !state.isActive || engineState !== 'RUNNING' || !state.tabId) return;

  // Page navigation is handled via tabs.onUpdated event (event-driven)
  // Content script will send SCRAPE_JOBS when page is ready
  // No arbitrary delay needed
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Jobzippy] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First time installation
    chrome.storage.local.set({
      version: chrome.runtime.getManifest().version,
      installedAt: new Date().toISOString(),
      onboardingStatus: {
        status: 'not_started',
        updatedAt: new Date().toISOString(),
      },
    });

    // Open welcome page in side panel
    chrome.sidePanel.setOptions({
      enabled: true,
    });
  }
});

// Handle messages from content scripts and UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log(
    '[Jobzippy] Background received message:',
    message.type,
    'from:',
    _sender.tab?.url || 'extension',
    'data:',
    message.data
  );

  switch (message.type) {
    // ========================================================================
    // NEW ARCHITECTURE: JobSession Message Handlers
    // ========================================================================
    case 'APPLY_JOB_START': {
      const msg = message as ApplyJobStartMessage;
      const { jobId } = msg.data;

      // Get sourceTabId from message sender (content scripts don't have access to chrome.tabs.query)
      const sourceTabId = _sender.tab?.id;
      if (!sourceTabId) {
        console.error(`[Jobzippy] APPLY_JOB_START: No tab ID available from sender`);
        logToContentScripts('Background', `APPLY_JOB_START: ERROR - No tab ID`);
        sendResponse({ status: 'error', message: 'No tab ID available' });
        return true;
      }

      console.log(`[Jobzippy] APPLY_JOB_START: jobId=${jobId}, sourceTabId=${sourceTabId}`);
      logToContentScripts(
        'Background',
        `APPLY_JOB_START: jobId=${jobId}, sourceTabId=${sourceTabId}`
      );

      // Create new job session
      const session: JobSession = {
        jobId,
        sourceTabId,
        status: 'pending',
        startedAt: Date.now(),
      };

      jobSessions.set(jobId, session);
      sendResponse({ status: 'ok', sessionId: jobId });
      break;
    }

    case 'LINKEDIN_MODAL_DETECTED': {
      const msg = message as LinkedInModalDetectedMessage;
      const { jobId } = msg.data;

      console.log(`[Jobzippy] LINKEDIN_MODAL_DETECTED: jobId=${jobId}`);
      logToContentScripts('Background', `LINKEDIN_MODAL_DETECTED: jobId=${jobId}`);

      const session = jobSessions.get(jobId);
      if (session) {
        session.status = 'linkedin-modal';
      }

      sendResponse({ status: 'ok' });
      break;
    }

    case 'JOB_COMPLETED': {
      const msg = message as JobCompletedMessage;
      const { jobId, success, error } = msg.data;

      console.log(`[Jobzippy] JOB_COMPLETED: jobId=${jobId}, success=${success}`);
      logToContentScripts('Background', `JOB_COMPLETED: jobId=${jobId}, success=${success}`);

      const session = jobSessions.get(jobId);
      if (session) {
        session.status = 'linkedin-modal';
        session.result = { success, error };
        clearAllTimeoutsForJob(jobId); // Clear any remaining timeouts
        jobSessions.delete(jobId); // Cleanup
      }

      sendResponse({ status: 'ok' });
      break;
    }

    case 'ATS_CONTENT_SCRIPT_READY': {
      const msg = message as ATSContentScriptReadyMessage;
      const { jobId } = msg.data;
      const tabId = _sender.tab?.id;

      if (!tabId) {
        sendResponse({ status: 'error', message: 'No tab ID' });
        return true;
      }

      console.log(
        `[Jobzippy] ATS_CONTENT_SCRIPT_READY: jobId=${jobId || 'missing'}, tabId=${tabId}`
      );
      logToContentScripts(
        'Background',
        `ATS_CONTENT_SCRIPT_READY: jobId=${jobId || 'missing'}, tabId=${tabId}`
      );

      // Find session by tabId (jobId might be missing from URL)
      const session = findJobSessionByATSTab(tabId);
      if (!session) {
        console.warn(`[Jobzippy] ATS ready but no matching session found for tabId=${tabId}`);
        sendResponse({ status: 'error', message: 'No matching session' });
        return true;
      }

      // If jobId provided, verify it matches (for safety)
      if (jobId && session.jobId !== jobId) {
        console.warn(`[Jobzippy] JobId mismatch: session has ${session.jobId}, received ${jobId}`);
        // Continue anyway - tabId match is more reliable
      }

      session.status = 'ats-filling';

      // Reset timeout when content script is ready (this is progress!)
      // Clear ALL existing timeouts first (defensive - prevent stale timeouts)
      clearAllTimeoutsForJob(session.jobId);

      const timeoutReason = 'Content script ready';
      const timeoutCreatedAt = Date.now();
      const timerId = setTimeout(() => {
        const timeSinceCreation = Date.now() - timeoutCreatedAt;
        console.log(
          `[Jobzippy] [TIMEOUT] setTimeout callback FIRED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", timeSinceCreation=${timeSinceCreation}ms (expected: 60000ms)`
        );
        logToContentScripts('Background', `[TIMEOUT] setTimeout callback FIRED`, {
          timerId,
          jobId: session.jobId,
          reason: timeoutReason,
          timeSinceCreation,
          expected: 60000,
        });
        if (timeSinceCreation < 1000) {
          console.error(
            `[Jobzippy] [TIMEOUT] BUG: Timeout fired too early! Only ${timeSinceCreation}ms elapsed, expected 60000ms`
          );
          logToContentScripts('Background', `[TIMEOUT] BUG: Timeout fired too early!`, {
            timerId,
            jobId: session.jobId,
            reason: timeoutReason,
            timeSinceCreation,
            expected: 60000,
          });
        }
        handleATSTimeout(session.jobId, 'timeout_callback', timerId);
      }, 60000) as unknown as number; // TESTING: 60 seconds (was 3 minutes)
      session.timerId = timerId;
      registerTimeout(session.jobId, timerId);
      console.log(
        `[Jobzippy] [TIMEOUT] setTimeout CREATED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", createdAt=${timeoutCreatedAt}, willFireAt=${timeoutCreatedAt + 60000}`
      );
      logToContentScripts('Background', `[TIMEOUT] Creating ATS timeout`, {
        jobId: session.jobId,
        reason: timeoutReason,
        duration: 60000,
        timerId,
      });

      // Send fill command
      chrome.tabs
        .sendMessage(tabId, {
          type: 'FILL_EXTERNAL_ATS',
          data: { jobId: session.jobId },
        } as FillExternalATSMessage)
        .then(() => {
          console.log(`[Jobzippy] ✓ FILL_EXTERNAL_ATS sent to tab ${tabId}`);
        })
        .catch((err) => {
          // Don't kill the session here!
          // A failure here often means the tab navigated immediately after sending "READY"
          // causing the message channel to close. This is a race condition but not a fatal error.
          // The tabs.onUpdated listener will catch the navigation and re-inject the script.
          console.warn(
            `[Jobzippy] Failed to send FILL_EXTERNAL_ATS (likely navigation race):`,
            err
          );
          logToContentScripts(
            'Background',
            `Failed to send FILL_EXTERNAL_ATS (ignoring, likely navigation)`,
            { error: String(err) }
          );
          // handleATSTimeout(session.jobId, 'FILL_EXTERNAL_ATS_failed'); // DISABLED
        });

      sendResponse({ status: 'ok' });
      return true;
    }

    case 'OPEN_EXTERNAL_ATS_TAB': {
      const { jobId, url } = message.data || {};
      if (!jobId || !url) {
        sendResponse({ status: 'error', message: 'Missing jobId or url' });
        break;
      }

      const session = jobSessions.get(jobId);
      if (!session) {
        console.warn(`[Jobzippy] OPEN_EXTERNAL_ATS_TAB: No active session for jobId=${jobId}`);
        sendResponse({ status: 'error', message: 'No active job session' });
        break;
      }

      console.log(`[Jobzippy] OPEN_EXTERNAL_ATS_TAB: jobId=${jobId}, url=${url}`);
      logToContentScripts('Background', `OPEN_EXTERNAL_ATS_TAB: jobId=${jobId}`, { url });

      chrome.tabs.create({ url, active: false }, (tab) => {
        const lastError = chrome.runtime.lastError;
        if (lastError || !tab?.id) {
          console.error(
            '[Jobzippy] Failed to create ATS tab via OPEN_EXTERNAL_ATS_TAB:',
            lastError?.message
          );
          sendResponse({ status: 'error', message: lastError?.message || 'Failed to create tab' });
          return;
        }

        session.atsTabId = tab.id;
        session.status = 'ats-opened';

        clearAllTimeoutsForJob(jobId);
        const timeoutReason = 'ATS tab opened (manual)';
        const timeoutCreatedAt = Date.now();
        const timerId = setTimeout(() => {
          const timeSinceCreation = Date.now() - timeoutCreatedAt;
          console.log(
            `[Jobzippy] [TIMEOUT] setTimeout callback FIRED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", timeSinceCreation=${timeSinceCreation}ms (expected: 60000ms)`
          );
          logToContentScripts('Background', `[TIMEOUT] setTimeout callback FIRED`, {
            timerId,
            jobId: session.jobId,
            reason: timeoutReason,
            timeSinceCreation,
            expected: 60000,
          });
          handleATSTimeout(session.jobId, timeoutReason, timerId);
        }, 60000) as unknown as number;
        session.timerId = timerId;
        registerTimeout(jobId, timerId);
        console.log(
          `[Jobzippy] [TIMEOUT] setTimeout CREATED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", createdAt=${timeoutCreatedAt}, willFireAt=${timeoutCreatedAt + 60000}`
        );
        logToContentScripts('Background', `[TIMEOUT] Creating ATS timeout`, {
          jobId: session.jobId,
          reason: timeoutReason,
          duration: 60000,
          timerId,
        });

        chrome.tabs
          .sendMessage(session.sourceTabId, {
            type: 'EXTERNAL_ATS_OPENED',
            data: { jobId: session.jobId, atsTabId: tab.id },
          } as ExternalATSOpenedMessage)
          .catch((err) => {
            console.error('[Jobzippy] Failed to send EXTERNAL_ATS_OPENED (manual):', err);
          });

        sendResponse({ status: 'ok', tabId: tab.id });
      });

      return true;
    }

    case 'ATS_NAVIGATION_STARTING': {
      const msg = message as ATSNavigationStartingMessage;
      const { jobId, newUrl } = msg.data;

      console.log(`[Jobzippy] ATS_NAVIGATION_STARTING: jobId=${jobId}, newUrl=${newUrl}`);
      logToContentScripts('Background', `ATS_NAVIGATION_STARTING: jobId=${jobId}`, { newUrl });

      const session = jobSessions.get(jobId);
      if (!session) {
        console.warn(`[Jobzippy] ATS_NAVIGATION_STARTING but no session found for jobId=${jobId}`);
        sendResponse({ status: 'error', message: 'No session found' });
        return true;
      }

      // Navigation is progress! Reset timeout immediately
      // Clear ALL existing timeouts first (defensive - prevent stale timeouts)
      clearAllTimeoutsForJob(jobId);

      // Reset timeout for another 3 minutes (navigation is progress, give it more time)
      const timeoutReason = 'Navigation starting';
      const timeoutCreatedAt = Date.now();
      const timerId = setTimeout(() => {
        const timeSinceCreation = Date.now() - timeoutCreatedAt;
        console.log(
          `[Jobzippy] [TIMEOUT] setTimeout callback FIRED: timerId=${timerId}, jobId=${session.jobId}, timeSinceCreation=${timeSinceCreation}ms (expected: 60000ms)`
        );
        logToContentScripts('Background', `[TIMEOUT] setTimeout callback FIRED`, {
          timerId,
          jobId: session.jobId,
          timeSinceCreation,
          expected: 60000,
        });
        if (timeSinceCreation < 1000) {
          console.error(
            `[Jobzippy] [TIMEOUT] BUG: Timeout fired too early! Only ${timeSinceCreation}ms elapsed, expected 60000ms`
          );
          logToContentScripts('Background', `[TIMEOUT] BUG: Timeout fired too early!`, {
            timerId,
            jobId: session.jobId,
            timeSinceCreation,
            expected: 60000,
          });
        }
        handleATSTimeout(session.jobId, 'timeout_callback', timerId);
      }, 60000) as unknown as number; // TESTING: 60 seconds (was 3 minutes)
      console.log(
        `[Jobzippy] [TIMEOUT] setTimeout CREATED: timerId=${timerId}, jobId=${session.jobId}, createdAt=${timeoutCreatedAt}, willFireAt=${timeoutCreatedAt + 60000}`
      );
      session.timerId = timerId;
      registerTimeout(jobId, timerId);
      console.log(
        `[Jobzippy] [TIMEOUT] Creating ATS timeout for jobId=${jobId}, reason="${timeoutReason}", duration=60000ms, newUrl=${newUrl}, timerId=${timerId}`
      );
      logToContentScripts('Background', `[TIMEOUT] Creating ATS timeout`, {
        jobId,
        reason: timeoutReason,
        duration: 60000,
        newUrl,
        timerId,
      });

      sendResponse({ status: 'ok' });
      return true;
    }

    case 'ATS_COMPLETE': {
      const msg = message as ATSCompleteMessage;
      const { jobId, success, error } = msg.data;

      console.log(`[Jobzippy] ATS_COMPLETE: jobId=${jobId}, success=${success}`);
      logToContentScripts('Background', `ATS_COMPLETE: jobId=${jobId}, success=${success}`);

      const session = jobSessions.get(jobId);
      if (!session) {
        console.warn(`[Jobzippy] ATS_COMPLETE but no session found for jobId=${jobId}`);
        sendResponse({ status: 'error', message: 'No session found' });
        return true;
      }

      session.status = 'ats-complete';
      session.result = { success, error };

      // Clear ALL timeouts (defensive - ensure no stale timeouts remain)
      clearAllTimeoutsForJob(jobId);
      session.timerId = undefined;

      // Notify LinkedIn tab
      chrome.tabs
        .sendMessage(session.sourceTabId, {
          type: 'EXTERNAL_ATS_DONE',
          data: { jobId, success, error },
        } as ExternalATSDoneMessage)
        .then(() => {
          console.log(`[Jobzippy] ✓ EXTERNAL_ATS_DONE sent to LinkedIn tab`);
        })
        .catch((err) => {
          console.error(`[Jobzippy] Failed to send EXTERNAL_ATS_DONE:`, err);
        });

      // Close ATS tab after delay
      if (session.atsTabId) {
        setTimeout(() => {
          chrome.tabs.remove(session.atsTabId!).catch(() => {});
        }, 1000);
      }

      // Cleanup
      clearAllTimeoutsForJob(jobId); // Clear any remaining timeouts
      jobSessions.delete(jobId);

      sendResponse({ status: 'ok' });
      return true;
    }

    // ========================================================================
    // OLD ARCHITECTURE: Keep for backward compatibility during migration
    // ========================================================================
    case 'AUTH_PROBE_ALL':
      // Probe active tabs for LinkedIn/Indeed (real) AND localhost mocks to re-emit AUTH_STATE
      try {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (!tab.id || !tab.url) continue;

            const isLinkedInReal = tab.url.includes('linkedin.com');
            const isIndeedReal = tab.url.includes('indeed.com');
            const isLinkedInMock =
              tab.url.startsWith('http://localhost:') && tab.url.includes('linkedin-jobs.html');
            const isIndeedMock =
              tab.url.startsWith('http://localhost:') && tab.url.includes('indeed-jobs.html');

            if (isLinkedInReal || isIndeedReal || isLinkedInMock || isIndeedMock) {
              chrome.tabs.sendMessage(tab.id, { type: 'AUTH_PROBE' }).catch(() => {});
            }
          }
        });
      } catch {
        // ignore
      }
      sendResponse({ status: 'ok' });
      break;

    case 'PAGE_ACTIVE': {
      // Content script is telling us it's active on a platform
      const platform = message.data?.platform as 'LinkedIn' | 'Indeed' | undefined;
      if (platform && _sender.tab?.id) {
        const state = platformStates.get(platform);
        if (state) {
          state.tabId = _sender.tab.id;
          console.log(`[Jobzippy] ${platform} content script active on tab:`, _sender.tab.id);
        }
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'START_AUTO_APPLY':
      startEngine();
      sendResponse({ status: 'success', state: engineState });
      break;
    case 'START_AGENT':
      console.log('[Jobzippy] Background received START_AGENT, forwarding to active tabs only');
      logToContentScripts('Background', 'START_AGENT received from sidepanel');

      // No auth preflight here in dev; sidepanel already decided it's OK to start.
      // Just forward START_AGENT to any tabs that have reported PAGE_ACTIVE.
      for (const [platform, state] of platformStates.entries()) {
        if (state.tabId) {
          console.log(`[Jobzippy] Forwarding START_AGENT to ${platform} tab:`, state.tabId);
          chrome.tabs
            .sendMessage(state.tabId, {
              type: 'START_AGENT',
              data: message.data || { maxApplications: 15 },
            })
            .catch((err) => {
              console.error(`[Jobzippy] Error sending START_AGENT to ${platform}:`, err);
            });
        } else {
          console.warn(
            `[Jobzippy] START_AGENT: No active tabId for ${platform} (PAGE_ACTIVE not received yet)`
          );
        }
      }

      // Optionally flip engine state to RUNNING so UI shows status immediately
      engineState = 'RUNNING';
      engineStatus = 'Starting…';
      broadcastEngineState();

      sendResponse({ status: 'started' });
      break;
    case 'STOP_AUTO_APPLY':
      stopEngine();
      sendResponse({ status: 'success', state: engineState });
      break;
    case 'ENGINE_STATE':
      sendResponse({ status: 'success', state: engineState, engineStatus });
      break;

    case 'PING':
      sendResponse({ status: 'ok', timestamp: Date.now() });
      break;

    case 'GET_PROFILE':
      // Handle async profile fetching
      (async () => {
        try {
          // Get user info to derive password
          const storage = await chrome.storage.local.get('user_info');
          const user = storage.user_info;

          if (!user) {
            console.warn('[Jobzippy] No user info found in storage');
            sendResponse({ status: 'error', message: 'User not logged in' });
            return;
          }

          // Use static imports
          console.log('[Jobzippy] User from storage:', JSON.stringify(user));
          const password = deriveVaultPassword(user);
          console.log('[Jobzippy] Derived password (masked):', password.substring(0, 10) + '...');

          const profile = await backgroundVaultService.load(STORES.profile, password);

          if (profile) {
            console.log('[Jobzippy] Profile loaded from vault: SUCCESS');
            console.log('[Jobzippy] Profile data preview:', {
              firstName: profile.identity?.first_name,
              lastName: profile.identity?.last_name,
              email: profile.identity?.email,
              phone: profile.identity?.phone_number,
              country: profile.identity?.country,
              resumeFileName: profile.resume?.file_name,
              coverLetterFileName: profile.cover_letter?.file_name,
            });
          } else {
            console.warn(
              '[Jobzippy] Profile is null or empty, check password derivation or vault content'
            );
          }
          sendResponse({ status: 'success', profile });
        } catch (error) {
          console.error('[Jobzippy] Error loading profile:', error);
          // Log to console only to avoid Service Worker crash
          console.error('Background', 'Error loading profile', error);
          sendResponse({
            status: 'error',
            message: `Failed to load profile: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
      return true; // Keep channel open for async response

    case 'GET_RESUME':
      // Handle async resume file fetching
      (async () => {
        try {
          // Get user info to derive password
          const storage = await chrome.storage.local.get('user_info');
          const user = storage.user_info;

          if (!user) {
            console.warn('[Jobzippy] No user info found in storage');
            sendResponse({ status: 'error', message: 'User not logged in' });
            return;
          }

          const password = deriveVaultPassword(user);
          const resumeArrayBuffer = await backgroundVaultService.loadResume(password);

          if (resumeArrayBuffer) {
            console.log('[Jobzippy] Resume loaded from vault: SUCCESS');
            // Convert ArrayBuffer to base64 for transfer
            const bytes = new Uint8Array(resumeArrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            sendResponse({
              status: 'success',
              resume: {
                data: base64,
                size: resumeArrayBuffer.byteLength,
              },
            });
          } else {
            console.warn('[Jobzippy] No resume found in vault');
            sendResponse({ status: 'success', resume: null });
          }
        } catch (error) {
          console.error('[Jobzippy] Error loading resume:', error);
          sendResponse({
            status: 'error',
            message: `Failed to load resume: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
      return true; // Keep channel open for async response

    // ========================================================================
    // JOB QUEUE MANAGEMENT
    // ========================================================================
    case 'PROCESS_JOB':
      (async () => {
        const { job, platform } = message.data;
        console.log(`[Jobzippy] Received PROCESS_JOB for ${job.title} on ${platform}`);

        try {
          // 1. Create a new tab for the job
          // We use the job URL from the job card
          let jobUrl = job.url;

          // If no URL in job card (e.g. some LinkedIn views), try to construct it or fail
          if (!jobUrl) {
            if (platform === 'LinkedIn') {
              jobUrl = `https://www.linkedin.com/jobs/view/${job.id}`;
            } else {
              throw new Error('No URL provided for job');
            }
          }

          const tab = await chrome.tabs.create({ url: jobUrl, active: true });
          console.log(`[Jobzippy] Created tab ${tab.id} for job ${job.id}`);

          // 2. Wait for tab to finish processing
          // We'll listen for JOB_COMPLETE or ATS_NAVIGATION_FAILED from the content script
          // This requires a temporary listener or a promise wrapper

          const result = await new Promise((resolve) => {
            const listener = (msg: any, sender: any) => {
              if (sender.tab?.id === tab.id) {
                if (
                  msg.type === 'JOB_COMPLETE' ||
                  msg.type === 'ATS_NAVIGATION_FAILED' ||
                  msg.type === 'ATS_ERROR'
                ) {
                  chrome.runtime.onMessage.removeListener(listener);
                  resolve(msg);
                }
              }
            };

            chrome.runtime.onMessage.addListener(listener);

            // Timeout after 2 minutes
            setTimeout(() => {
              chrome.runtime.onMessage.removeListener(listener);
              resolve({ success: false, error: 'Timeout waiting for job processing' });
            }, 120000);
          });

          // 3. Close the tab
          if (tab.id) {
            await chrome.tabs.remove(tab.id);
            console.log(`[Jobzippy] Closed tab ${tab.id}`);
          }

          // 4. Respond to AgentController
          sendResponse({ success: true, result });
        } catch (error) {
          console.error('[Jobzippy] Error processing job:', error);
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return true;

    case 'JOB_APPLIED':
      // TODO: Log application to Google Sheet
      console.log('[Jobzippy] Job applied:', message.data);
      sendResponse({ status: 'success' });
      break;

    case 'JOBS_SCRAPED': {
      const data = message.data as {
        platform: 'LinkedIn' | 'Indeed';
        jobs: JobQueueItem[];
        hasNextPage: boolean;
        currentPage: number;
      };
      if (data) {
        handleJobsScraped(data.platform, data.jobs, data.hasNextPage, data.currentPage).catch(
          (err) => {
            console.error('[Jobzippy] Error handling scraped jobs:', err);
          }
        );
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'JOB_DETAILS_SCRAPED': {
      // Story 5: Handle scraped details and decide next step
      const data = message.data as {
        platform: 'LinkedIn' | 'Indeed';
        jobId: string;
        description: string;
        applyType: 'easy_apply' | 'external' | 'unknown';
      };

      const state = platformStates.get(data.platform);
      if (state && state.isActive && engineState === 'RUNNING') {
        console.log(
          `[Jobzippy] ${data.platform}: Details received for ${data.jobId}. Type: ${data.applyType}`
        );

        // Heuristic Logic:
        // 1. If Easy Apply -> Apply (Mock for now)
        // 2. If External -> Skip

        if (data.applyType === 'easy_apply') {
          console.log(
            `[Jobzippy] ${data.platform}: Found Easy Apply job! Simulating application...`
          );
          // TODO: Implement actual click logic for Easy Apply
          state.jobsProcessed++;

          // Update daily limits
          if (dailyLimits) {
            dailyLimits.total++;
            if (data.platform === 'LinkedIn') dailyLimits.linkedin++;
            else dailyLimits.indeed++;
            chrome.storage.local.set({ dailyLimits });
          }
        } else {
          console.log(`[Jobzippy] ${data.platform}: External apply, skipping.`);
        }

        // Move to next job immediately (event-driven - no arbitrary delays)
        state.isProcessingJob = false;
        processJobQueue(data.platform);
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'PAGE_NAVIGATED': {
      const data = message.data as { platform: 'LinkedIn' | 'Indeed'; url: string };
      if (data) {
        handlePageNavigated(data.platform);
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'USER_INTERACTION': {
      // User interacted with search tab - pause engine
      const platform = message.data?.platform;
      console.log(
        '[Jobzippy] Background received USER_INTERACTION from',
        platform,
        'engineState:',
        engineState
      );
      if (engineState === 'RUNNING') {
        console.log('[Jobzippy] Background pausing engine due to user interaction');
        engineState = 'PAUSED';
        engineStatus = 'Paused (user interaction detected)';
        broadcastEngineState();
        // Auto-resume is now event-driven - user can resume manually or via START_ENGINE message
        // No arbitrary delay needed
      } else {
        console.log('[Jobzippy] Background ignoring USER_INTERACTION - engine not running');
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'TAB_ACTIVATED': {
      // User switched to search tab - show toast but don't pause
      const data = message.data as { platform: 'LinkedIn' | 'Indeed'; tabId: number };
      if (data) {
        // Notify side panel to show toast
        chrome.runtime
          .sendMessage({
            type: 'SHOW_TAB_TOAST',
            data: { platform: data.platform },
          })
          .catch(() => {});
      }
      sendResponse({ status: 'ok' });
      break;
    }

    case 'LOG_MESSAGE': {
      // Handle log messages from side panel or other parts
      const { component, message: logMessage, data } = message.data;
      logToContentScripts(component, logMessage, data);
      sendResponse({ status: 'ok' });
      break;
    }

    default:
      sendResponse({ status: 'error', message: 'Unknown message type' });
  }

  return true; // Keep message channel open for async response
});

// Handle alarms for scheduled tasks
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('[Jobzippy] Alarm triggered:', alarm.name);

  switch (alarm.name) {
    case 'auto-apply':
      // TODO: Trigger auto-apply cycle
      console.log('[Jobzippy] Starting auto-apply cycle');
      break;

    case 'daily-summary':
      // TODO: Send daily summary notification
      console.log('[Jobzippy] Sending daily summary');
      break;

    default:
      console.log('[Jobzippy] Unknown alarm:', alarm.name);
  }
});

// Probe auth state on tab updates (SPA or full navigations)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (
      changeInfo.status === 'complete' &&
      tab.url &&
      (tab.url.includes('linkedin.com') ||
        tab.url.includes('indeed.com') ||
        (tab.url.startsWith('http://localhost:') &&
          (tab.url.includes('linkedin-jobs.html') || tab.url.includes('indeed-jobs.html'))))
    ) {
      // Content scripts auto-inject via manifest for both real and mock pages
      // Wait a bit for initialization, then probe
      const isIndeed = tab.url.includes('indeed') || tab.url.includes('indeed-jobs.html');
      console.log(
        '[Jobzippy] Tab updated - platform:',
        isIndeed ? 'Indeed' : 'LinkedIn',
        'url:',
        tab.url,
        'tabId:',
        tabId
      );
      // Send immediately when tab is ready (event-driven - tabs.onUpdated already fired)
      console.log(
        `[Jobzippy] Sending AUTH_PROBE to ${isIndeed ? 'Indeed' : 'LinkedIn'} tab ${tabId} (event-driven)`
      );
      chrome.tabs.sendMessage(tabId, { type: 'AUTH_PROBE' }).catch((err) => {
        console.error(
          '[Jobzippy] Error sending AUTH_PROBE on tab update:',
          err,
          'tabId:',
          tabId,
          'url:',
          tab.url
        );
      });
    }
  } catch {
    // ignore
  }
});

// Tab visibility detection (show toast when user switches to search tab, but don't pause)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab.url) return;
    const linkedinState = platformStates.get('LinkedIn');
    const indeedState = platformStates.get('Indeed');

    const isLinkedInTab =
      (tab.url.includes('linkedin.com/jobs') ||
        (tab.url.startsWith('http://localhost:') && tab.url.includes('linkedin-jobs.html'))) &&
      linkedinState?.tabId === activeInfo.tabId;
    const isIndeedTab =
      ((tab.url.includes('indeed.com') && tab.url.includes('jobs')) ||
        (tab.url.startsWith('http://localhost:') && tab.url.includes('indeed-jobs.html'))) &&
      indeedState?.tabId === activeInfo.tabId;

    if (isLinkedInTab) {
      // User switched to LinkedIn search tab - show toast
      chrome.runtime
        .sendMessage({
          type: 'TAB_ACTIVATED',
          data: { platform: 'LinkedIn', tabId: activeInfo.tabId },
        })
        .catch(() => {});
    } else if (isIndeedTab) {
      // User switched to Indeed search tab - show toast
      chrome.runtime
        .sendMessage({
          type: 'TAB_ACTIVATED',
          data: { platform: 'Indeed', tabId: activeInfo.tabId },
        })
        .catch(() => {});
    }
  });
});

// Handle tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  // Check if a search tab was closed
  platformStates.forEach((state) => {
    if (state.tabId === tabId) {
      console.log(`[Jobzippy] ${state.platform} search tab closed, stopping iteration`);
      state.isActive = false;
      state.tabId = null;
      state.jobQueue = [];
      state.isProcessingJob = false;
      broadcastEngineState();
    }
  });
});

// ============================================================================
// EXTERNAL ATS TAB LIFECYCLE LISTENERS
// ============================================================================

// Detect when external ATS tabs are created via link clicks or window.open()
// Using webNavigation API because it reliably captures sourceTabId even with window.open()
if (chrome.webNavigation && chrome.webNavigation.onCreatedNavigationTarget) {
  chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    console.log('[Jobzippy] webNavigation.onCreatedNavigationTarget fired:', details);
    logToContentScripts('Background', 'webNavigation.onCreatedNavigationTarget fired', details);

    const { sourceTabId, tabId, url } = details;

    if (!sourceTabId || !tabId) {
      console.log('[Jobzippy] Missing sourceTabId or tabId, ignoring');
      logToContentScripts('Background', 'Missing sourceTabId or tabId, ignoring');
      return;
    }

    // NEW ARCHITECTURE: Check JobSession first
    // Try to extract jobId from URL first (e.g., ?job=123457)
    const urlParams = new URL(url).searchParams;
    const jobIdFromUrl = urlParams.get('job');

    // Find session by jobId from URL if available, otherwise fall back to sourceTabId
    let session: JobSession | undefined;
    if (jobIdFromUrl) {
      session = jobSessions.get(jobIdFromUrl);
      if (session && session.status === 'pending' && session.sourceTabId === sourceTabId) {
        console.log(
          `[Jobzippy] NEW: External ATS detected via JobSession (matched by jobId from URL): jobId=${session.jobId}, tabId=${tabId}`
        );
      } else {
        session = undefined; // JobId mismatch, try fallback
      }
    }

    // Fallback: find by sourceTabId (for cases where URL doesn't have jobId)
    if (!session) {
      session = findJobSessionBySourceTab(sourceTabId);
    }

    if (session && isATSUrl(url)) {
      console.log(
        `[Jobzippy] NEW: External ATS detected via JobSession: jobId=${session.jobId}, tabId=${tabId}`
      );
      logToContentScripts(
        'Background',
        `NEW: External ATS detected: jobId=${session.jobId}, tabId=${tabId}`
      );

      session.atsTabId = tabId;
      session.status = 'ats-opened';

      // Set timeout for entire ATS flow
      // Clear ALL existing timeouts first (defensive - prevent stale timeouts)
      clearAllTimeoutsForJob(session.jobId);

      const timeoutReason = 'ATS tab opened';
      const timeoutCreatedAt = Date.now();
      const timerId = setTimeout(() => {
        const timeSinceCreation = Date.now() - timeoutCreatedAt;
        console.log(
          `[Jobzippy] [TIMEOUT] setTimeout callback FIRED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", timeSinceCreation=${timeSinceCreation}ms (expected: 60000ms)`
        );
        logToContentScripts('Background', `[TIMEOUT] setTimeout callback FIRED`, {
          timerId,
          jobId: session.jobId,
          reason: timeoutReason,
          timeSinceCreation,
          expected: 60000,
        });
        if (timeSinceCreation < 1000) {
          console.error(
            `[Jobzippy] [TIMEOUT] BUG: Timeout fired too early! Only ${timeSinceCreation}ms elapsed, expected 60000ms`
          );
          logToContentScripts('Background', `[TIMEOUT] BUG: Timeout fired too early!`, {
            timerId,
            jobId: session.jobId,
            reason: timeoutReason,
            timeSinceCreation,
            expected: 60000,
          });
        }
        handleATSTimeout(session.jobId, timerId);
      }, 60000) as unknown as number; // TESTING: 60 seconds (was 3 minutes)
      session.timerId = timerId;
      registerTimeout(session.jobId, timerId);
      console.log(
        `[Jobzippy] [TIMEOUT] setTimeout CREATED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", createdAt=${timeoutCreatedAt}, willFireAt=${timeoutCreatedAt + 60000}`
      );
      logToContentScripts('Background', `[TIMEOUT] Creating ATS timeout`, {
        jobId: session.jobId,
        reason: timeoutReason,
        duration: 60000,
        timerId,
      });

      // Immediately notify LinkedIn tab
      chrome.tabs
        .sendMessage(session.sourceTabId, {
          type: 'EXTERNAL_ATS_OPENED',
          data: { jobId: session.jobId, atsTabId: tabId },
        } as ExternalATSOpenedMessage)
        .catch((err) => {
          console.error(`[Jobzippy] Failed to send EXTERNAL_ATS_OPENED:`, err);
        });

      return; // Handled by new architecture
    }

    // If no JobSession found, log warning and close the stray tab to avoid leaving it open
    console.warn(
      `[Jobzippy] External ATS tab detected but no JobSession found for sourceTabId=${sourceTabId}`
    );
    logToContentScripts('Background', `External ATS tab detected but no JobSession found`, {
      sourceTabId,
      tabId,
      url,
    });
    chrome.tabs.remove(tabId).catch(() => {});
  });
}

// Detect when external ATS tabs finish loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  // FIRST: Check if this tab is part of an active ATS flow (regardless of URL)
  // This handles navigation within the same ATS flow (e.g., workday-apply.html -> workday-form.html)
  const session = findJobSessionByATSTab(tabId);
  if (session && (session.status === 'ats-opened' || session.status === 'ats-filling')) {
    // Navigation occurred - this is progress! Reset timeout
    // Clear ALL existing timeouts first (defensive - prevent stale timeouts)
    clearAllTimeoutsForJob(session.jobId);

    // Reset timeout for another 3 minutes (navigation is progress, give it more time)
    const timeoutReason = 'ATS tab navigated';
    const timeoutCreatedAt = Date.now();
    const timerId = setTimeout(() => {
      const timeSinceCreation = Date.now() - timeoutCreatedAt;
      console.log(
        `[Jobzippy] [TIMEOUT] setTimeout callback FIRED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", timeSinceCreation=${timeSinceCreation}ms (expected: 60000ms)`
      );
      logToContentScripts('Background', `[TIMEOUT] setTimeout callback FIRED`, {
        timerId,
        jobId: session.jobId,
        reason: timeoutReason,
        timeSinceCreation,
        expected: 60000,
      });
      if (timeSinceCreation < 1000) {
        console.error(
          `[Jobzippy] [TIMEOUT] BUG: Timeout fired too early! Only ${timeSinceCreation}ms elapsed, expected 60000ms`
        );
        logToContentScripts('Background', `[TIMEOUT] BUG: Timeout fired too early!`, {
          timerId,
          jobId: session.jobId,
          reason: timeoutReason,
          timeSinceCreation,
          expected: 60000,
        });
      }
      handleATSTimeout(session.jobId, timerId);
    }, 60000) as unknown as number; // TESTING: 60 seconds (was 3 minutes)
    session.timerId = timerId;
    registerTimeout(session.jobId, timerId);
    console.log(
      `[Jobzippy] [TIMEOUT] setTimeout CREATED: timerId=${timerId}, jobId=${session.jobId}, reason="${timeoutReason}", createdAt=${timeoutCreatedAt}, willFireAt=${timeoutCreatedAt + 60000}, newUrl=${tab.url}`
    );
    logToContentScripts('Background', `[TIMEOUT] Creating ATS timeout`, {
      jobId: session.jobId,
      reason: timeoutReason,
      duration: 60000,
      newUrl: tab.url,
      timerId,
    });

    console.log(
      `[Jobzippy] ATS tab navigated (JobSession): jobId=${session.jobId}, tabId=${tabId}, newUrl=${tab.url}`
    );
    logToContentScripts('Background', `ATS tab navigated: jobId=${session.jobId}, tabId=${tabId}`, {
      url: tab.url,
    });

    // Update status if needed (only if it was 'ats-opened', don't downgrade 'ats-filling')
    if (session.status === 'ats-opened') {
      session.status = 'ats-filling';
    }

    // Re-inject content script on navigation (page reloaded, script needs to restart)
    console.log(`[Jobzippy] Re-injecting ATS content script after navigation into tab ${tabId}`);
    logToContentScripts(
      'Background',
      `Re-injecting ATS content script after navigation into tab ${tabId}`
    );

    // Inject Alert Handler (MAIN world) to prevent blocking alerts
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: () => {
          if ((window as any).jobzippyAlertHandlerInstalled) return;
          (window as any).jobzippyAlertHandlerInstalled = true;
          console.log('[Jobzippy] Installing alert handler in MAIN world');
          const _originalAlert = window.alert;
          window.alert = function (message: string) {
            console.log('[Jobzippy] Intercepted alert:', message);
            let alertDiv = document.getElementById('jobzippy-last-alert');
            if (!alertDiv) {
              alertDiv = document.createElement('div');
              alertDiv.id = 'jobzippy-last-alert';
              alertDiv.style.display = 'none';
              document.body.appendChild(alertDiv);
            }
            alertDiv.textContent = message;
            alertDiv.setAttribute('data-timestamp', Date.now().toString());
            window.dispatchEvent(new CustomEvent('jobzippy-alert', { detail: message }));
            return true;
          };
          window.confirm = function (message: string) {
            console.log('[Jobzippy] Intercepted confirm:', message);
            return true;
          };
          window.prompt = function (message: string) {
            console.log('[Jobzippy] Intercepted prompt:', message);
            return '';
          };
        },
      })
      .catch((err) => console.error('[Jobzippy] Failed to inject alert handler:', err));

    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ['content/content-ats.js'],
      })
      .then(() => {
        console.log(`[Jobzippy] ✓ Content script re-injected into tab ${tabId} after navigation`);
        logToContentScripts(
          'Background',
          `✓ Content script re-injected after navigation into tab ${tabId}`
        );
        // ATS_CONTENT_SCRIPT_READY handler will send FILL_EXTERNAL_ATS
      })
      .catch((err) => {
        console.error(`[Jobzippy] Failed to re-inject content script after navigation:`, err);
        logToContentScripts('Background', `Failed to re-inject content script after navigation`, {
          error: String(err),
        });
        handleATSTimeout(session.jobId, 'reinject_failed');
      });

    return; // Handled
  }

  // SECOND: Check if this is a new external ATS URL (for new tabs)
  const isExternalATS = isATSUrl(tab.url);
  if (!isExternalATS) return;

  // NEW ARCHITECTURE: Check JobSession for new ATS tabs
  const newSession = findJobSessionByATSTab(tabId);
  if (newSession && newSession.status === 'ats-opened') {
    console.log(
      `[Jobzippy] NEW: External ATS tab loaded (JobSession): jobId=${newSession.jobId}, tabId=${tabId}`
    );
    logToContentScripts(
      'Background',
      `NEW: External ATS tab loaded: jobId=${newSession.jobId}, tabId=${tabId}`,
      { url: tab.url }
    );

    // Close any other pending tabs from the same source tab (sequential requirement)
    for (const [otherJobId, otherSession] of jobSessions.entries()) {
      if (
        otherSession.sourceTabId === newSession.sourceTabId &&
        otherSession.atsTabId &&
        otherSession.atsTabId !== tabId &&
        (otherSession.status === 'ats-opened' || otherSession.status === 'ats-filling')
      ) {
        console.log(
          `[Jobzippy] Closing old ATS tab ${otherSession.atsTabId} before processing new tab ${tabId}`
        );
        logToContentScripts('Background', `Closing old ATS tab ${otherSession.atsTabId}`, {
          newTabId: tabId,
        });
        if (otherSession.timerId) {
          clearTimeout(otherSession.timerId);
        }
        chrome.tabs.remove(otherSession.atsTabId).catch(() => {});
        handleATSTimeout(otherJobId, 'cleanup_old_session'); // Cleanup old session
      }
    }

    // Inject ATS content script
    console.log(`[Jobzippy] Injecting ATS content script into tab ${tabId} (JobSession)`);
    logToContentScripts('Background', `Injecting ATS content script into tab ${tabId}`);

    // Inject Alert Handler (MAIN world) to prevent blocking alerts
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: () => {
          if ((window as any).jobzippyAlertHandlerInstalled) return;
          (window as any).jobzippyAlertHandlerInstalled = true;
          console.log('[Jobzippy] Installing alert handler in MAIN world');
          const _originalAlert = window.alert;
          window.alert = function (message: string) {
            console.log('[Jobzippy] Intercepted alert:', message);
            let alertDiv = document.getElementById('jobzippy-last-alert');
            if (!alertDiv) {
              alertDiv = document.createElement('div');
              alertDiv.id = 'jobzippy-last-alert';
              alertDiv.style.display = 'none';
              document.body.appendChild(alertDiv);
            }
            alertDiv.textContent = message;
            alertDiv.setAttribute('data-timestamp', Date.now().toString());
            window.dispatchEvent(new CustomEvent('jobzippy-alert', { detail: message }));
            return true;
          };
          window.confirm = function (message: string) {
            console.log('[Jobzippy] Intercepted confirm:', message);
            return true;
          };
          window.prompt = function (message: string) {
            console.log('[Jobzippy] Intercepted prompt:', message);
            return '';
          };
        },
      })
      .catch((err) => console.error('[Jobzippy] Failed to inject alert handler:', err));

    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: ['content/content-ats.js'],
      })
      .then(() => {
        console.log(`[Jobzippy] ✓ Content script injected into tab ${tabId}`);
        logToContentScripts('Background', `✓ Content script injected into tab ${tabId}`);
        // ATS_CONTENT_SCRIPT_READY handler will update status and send FILL_EXTERNAL_ATS
      })
      .catch((err) => {
        console.error(`[Jobzippy] Failed to inject content script into tab ${tabId}:`, err);
        logToContentScripts('Background', `Failed to inject content script into tab ${tabId}`, {
          error: String(err),
        });
        handleATSTimeout(newSession.jobId, 'inject_failed');
      });

    return; // Handled by new architecture
  }

  // If no JobSession found, log warning (this shouldn't happen with new architecture)
  console.warn(`[Jobzippy] External ATS tab loaded but no JobSession found for tabId=${tabId}`);
  logToContentScripts('Background', `External ATS tab loaded but no JobSession found`, {
    tabId,
    url: tab.url,
  });
});

// Set up default alarms (placeholder for now)
chrome.alarms.create('auto-apply', {
  periodInMinutes: 60, // Run every hour
});

// Handle side panel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Jobzippy] Error setting panel behavior:', error));

// Export for testing (if needed)
export {};
