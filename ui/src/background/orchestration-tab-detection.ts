/**
 * Orchestration Tab Detection (V2)
 * Minimal tab detection for Orchestrator V2 flow
 *
 * Responsibilities:
 * - Detect when ATS tabs are opened from LinkedIn/Indeed
 * - Inject executor-v2.js into ATS tabs when they finish loading
 * - Send EXTERNAL_ATS_OPENED message to executor
 * - Track jobId -> atsTabId mapping for cleanup
 *
 * NOTE: This is duplicated from index.ts for the new flow.
 * Old flow still uses the full implementation in index.ts.
 */

import type { ExternalATSOpenedMessage } from '../types/job-session';

// ============================================================================
// SIMPLE STATE TRACKING
// ============================================================================

/**
 * Track which job is currently being processed per source tab
 * Updated by orchestration as it processes jobs
 */
const activeJobBySourceTab = new Map<number, string>(); // sourceTabId -> currentJobId

/**
 * Track which ATS tab was opened for which job (for cleanup fallback)
 */
const atsTabByJobId = new Map<string, number>(); // jobId -> atsTabId

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Check if a URL is an ATS URL
 * (Restored from index.ts - needed for injection logic)
 */
function isATSUrl(url: string): boolean {
  if (!url) return false;

  // Check for ATS domains
  const atsDomains = [
    'greenhouse.io',
    'greenhouse.com',
    'workday.com',
    'myworkdayjobs.com',
    'lever.co',
    'jobs.lever.co',
    'icims.com',
    'taleo.net',
  ];

  if (atsDomains.some((domain) => url.includes(domain))) {
    return true;
  }

  // Check for /mocks/ path OR ATS names in path (e.g., greenhouse-apply.html, workday-form.html)
  if (url.includes('/mocks/')) {
    const atsNames = [
      'greenhouse',
      'workday',
      'lever',
      'icims',
      'taleo',
      'apply', // Generic apply pages
    ];
    const hasAtsNameInPath = atsNames.some((name) => url.toLowerCase().includes(name));
    return hasAtsNameInPath;
  }

  return false;
}

/**
 * Inject executor-v2.js into an ATS tab
 * (Same pattern as old flow injects content-ats.js)
 *
 * IMPORTANT: Must inject alert handler FIRST (in MAIN world) to prevent blocking alerts
 */
async function injectExecutorV2(tabId: number): Promise<void> {
  try {
    console.log(`[Orchestration Tab Detection] Injecting executor-v2.js into tab ${tabId}`);

    // FIRST: Inject Alert Handler (MAIN world) to prevent blocking alerts
    // This intercepts window.alert() so alerts don't block and can be detected by intelligentNavigate
    // (Same as old flow does in index.ts line 1949-1983)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if ((window as any).jobzippyAlertHandlerInstalled) return;
        (window as any).jobzippyAlertHandlerInstalled = true;
        console.log('[Orchestration Tab Detection] Installing alert handler in MAIN world');
        window.alert = function (message: string) {
          console.log('[Orchestration Tab Detection] Intercepted alert:', message);
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
          return true; // Prevents blocking alert dialog
        };
        (window as any).confirm = function (message: string) {
          console.log('[Orchestration Tab Detection] Intercepted confirm:', message);
          return true;
        };
        (window as any).prompt = function (message: string) {
          console.log('[Orchestration Tab Detection] Intercepted prompt:', message);
          return '';
        };
      },
    });

    // SECOND: Inject executor-v2.js content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/executor-v2.js'],
    });

    console.log(`[Orchestration Tab Detection] ✓ Executor-v2.js injected into tab ${tabId}`);
  } catch (error) {
    console.error(
      `[Orchestration Tab Detection] Failed to inject executor-v2.js into tab ${tabId}:`,
      error
    );
    throw error;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register active job for a source tab
 * Called by orchestration when processing a job
 */
export function registerActiveJob(sourceTabId: number, jobId: string): void {
  activeJobBySourceTab.set(sourceTabId, jobId);
  console.log(
    `[Orchestration Tab Detection] Registered active job ${jobId} for source tab ${sourceTabId}`
  );
}

/**
 * Unregister active job for a source tab
 * Called by orchestration when job is complete/skipped
 */
export function unregisterActiveJob(sourceTabId: number): void {
  const jobId = activeJobBySourceTab.get(sourceTabId);
  if (jobId) {
    activeJobBySourceTab.delete(sourceTabId);
    // Keep atsTabId mapping for cleanup (will be cleared when cleanup runs)
    console.log(
      `[Orchestration Tab Detection] Unregistered active job ${jobId} for source tab ${sourceTabId}`
    );
  }
}

/**
 * Get ATS tab ID for a job (for cleanup fallback)
 */
export function getAtsTabIdForJob(jobId: string): number | null {
  return atsTabByJobId.get(jobId) || null;
}

/**
 * Clear ATS tab mapping for a job (called during cleanup)
 */
export function clearAtsTabForJob(jobId: string): void {
  atsTabByJobId.delete(jobId);
}

/**
 * Check if an ATS tab is tracked by orchestration V2
 * Used by old flow to avoid closing orchestration V2 tabs
 */
export function isAtsTabTracked(tabId: number): boolean {
  for (const atsTabId of atsTabByJobId.values()) {
    if (atsTabId === tabId) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// TAB DETECTION LISTENER
// ============================================================================

/**
 * Initialize tab detection listener for orchestration flow
 * Should be called once when orchestration starts
 */
export function initializeOrchestrationTabDetection(): void {
  // Detect when external ATS tabs are created via link clicks
  chrome.tabs.onCreated.addListener((tab) => {
    const { id: tabId, openerTabId } = tab;

    if (!openerTabId || !tabId) {
      // No opener means it's a new user-created tab, not an apply flow
      return;
    }

    // Check if this tab was opened from one of our source tabs
    const jobId = activeJobBySourceTab.get(openerTabId);
    if (!jobId) {
      // Not part of our orchestration flow - ignore
      return;
    }

    console.log('[Orchestration Tab Detection] ATS tab opened', {
      tabId,
      openerTabId,
      jobId,
    });

    // Store mapping for cleanup
    atsTabByJobId.set(jobId, tabId);

    // Send EXTERNAL_ATS_OPENED message to executor (content script)
    chrome.tabs
      .sendMessage(openerTabId, {
        type: 'EXTERNAL_ATS_OPENED',
        data: { jobId, atsTabId: tabId },
      } as ExternalATSOpenedMessage)
      .catch((err) => {
        console.error('[Orchestration Tab Detection] Failed to send EXTERNAL_ATS_OPENED:', err);
      });
  });

  // Detect when tabs finish loading and inject necessary scripts
  // Handles both ATS tabs (inject executor-v2.js) and LinkedIn/Indeed tabs (inject alert handler)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only process when page is fully loaded
    if (changeInfo.status !== 'complete' || !tab.url) {
      return;
    }

    // Check if this is a LinkedIn or Indeed tab (job board pages)
    const isJobBoardUrl =
      tab.url.includes('linkedin.com') ||
      tab.url.includes('indeed.com') ||
      tab.url.includes('/mocks/linkedin') ||
      tab.url.includes('/mocks/indeed');

    if (isJobBoardUrl) {
      // Inject alert handler into MAIN world for LinkedIn/Indeed tabs
      console.log(
        `[Orchestration Tab Detection] Injecting alert handler into job board tab ${tabId}`
      );
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: 'MAIN',
          func: () => {
            if ((window as any).jobzippyAlertHandlerInstalled) return;
            (window as any).jobzippyAlertHandlerInstalled = true;
            console.log(
              '[Orchestration Tab Detection] Installing alert handler in MAIN world (job board)'
            );
            window.alert = function (message: string) {
              console.log('[Orchestration Tab Detection] Intercepted alert:', message);
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
              return true; // Prevents blocking alert dialog
            };
            (window as any).confirm = function (message: string) {
              console.log('[Orchestration Tab Detection] Intercepted confirm:', message);
              return true;
            };
            (window as any).prompt = function (message: string) {
              console.log('[Orchestration Tab Detection] Intercepted prompt:', message);
              return '';
            };
          },
        })
        .catch((error) => {
          console.error(
            `[Orchestration Tab Detection] Failed to inject alert handler into job board tab ${tabId}:`,
            error
          );
        });
    }

    // Check if this tab is tracked as an ATS tab (reverse lookup)
    let trackedJobId: string | null = null;
    for (const [jobId, atsTabId] of atsTabByJobId.entries()) {
      if (atsTabId === tabId) {
        trackedJobId = jobId;
        break;
      }
    }

    if (!trackedJobId) {
      // Not a tracked ATS tab - ignore (but we already handled LinkedIn/Indeed above)
      return;
    }

    // Check if URL is an ATS URL
    if (!isATSUrl(tab.url)) {
      // Not an ATS URL - might be a redirect, wait for next navigation
      console.log(
        `[Orchestration Tab Detection] Tab ${tabId} URL is not ATS URL, waiting:`,
        tab.url
      );
      return;
    }

    // Inject executor-v2.js into the ATS tab (same pattern as old flow)
    console.log(
      `[Orchestration Tab Detection] ATS tab finished loading, injecting executor-v2.js`,
      {
        tabId,
        jobId: trackedJobId,
        url: tab.url,
      }
    );

    injectExecutorV2(tabId).catch((error) => {
      console.error(`[Orchestration Tab Detection] Failed to inject executor-v2.js:`, error);
    });
  });

  console.log('[Orchestration Tab Detection] Tab detection listener initialized');
}
