/**
 * Background Service Worker
 * Handles extension lifecycle, messaging, and orchestration
 */

console.log('[Jobzippy] Background service worker initialized');

// -----------------------------------------------------------------------------
// Lightweight Engine State (Story 1: Start/Stop lifecycle)
// -----------------------------------------------------------------------------
type EngineState = 'IDLE' | 'RUNNING' | 'PAUSED';
let engineState: EngineState = 'IDLE';
let engineStatus: string = 'Idle';
let engineInterval: number | null = null;

// -----------------------------------------------------------------------------
// Story 4: Search Iteration & Limit Tracking
// -----------------------------------------------------------------------------
interface PlatformState {
  platform: 'LinkedIn' | 'Indeed';
  tabId: number | null;
  currentPage: number;
  jobsScraped: number;
  jobsProcessed: number;
  hasNextPage: boolean;
  searchUrl: string | null;
  isActive: boolean;
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

          // Content scripts auto-inject via manifest, wait for initialization
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id!, { type: 'AUTH_PROBE' }).catch(() => {});
            if (engineState === 'RUNNING' && state.tabId) {
              chrome.tabs.sendMessage(state.tabId, { type: 'SCRAPE_JOBS' }).catch((err) => {
                console.error('[Jobzippy] Error sending SCRAPE_JOBS to LinkedIn:', err);
              });
            }
          }, 1000);
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

            // Content scripts auto-inject via manifest, wait for initialization
            setTimeout(() => {
              console.log('[Jobzippy] Sending AUTH_PROBE to Indeed tab:', tab.id);
              chrome.tabs.sendMessage(tab.id!, { type: 'AUTH_PROBE' }).catch((err) => {
                console.error('[Jobzippy] Error sending AUTH_PROBE to Indeed:', err);
              });
              if (engineState === 'RUNNING' && state.tabId) {
                chrome.tabs.sendMessage(state.tabId, { type: 'SCRAPE_JOBS' }).catch((err) => {
                  console.error('[Jobzippy] Error sending SCRAPE_JOBS to Indeed:', err);
                });
              }
            }, 1000);
          } else {
            console.error('[Jobzippy] Indeed state not found in platformStates');
          }
        }
      }
    }
  });

  // Heartbeat to update status
  engineInterval = self.setInterval(() => {
    if (engineState === 'RUNNING') {
      const linkedinState = platformStates.get('LinkedIn');
      const indeedState = platformStates.get('Indeed');
      const totalScraped = (linkedinState?.jobsScraped || 0) + (indeedState?.jobsScraped || 0);
      engineStatus = totalScraped > 0 ? `Scraped ${totalScraped} jobs…` : 'Running…';
      broadcastEngineState();
    }
  }, 5000);
}

function stopEngine() {
  if (engineState === 'IDLE') return;
  engineState = 'IDLE';
  engineStatus = 'Stopped';
  if (engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
  }
  // Reset platform states
  platformStates.forEach((state) => {
    state.isActive = false;
    state.currentPage = 0;
  });
  broadcastEngineState();
}

// Handle job scraping results and pagination
async function handleJobsScraped(
  platform: 'LinkedIn' | 'Indeed',
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    platform: 'LinkedIn' | 'Indeed';
  }>,
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

  // Process jobs (for now, just count them - actual processing in Story 5)
  // TODO: In Story 5, we'll open job details and decide apply/skip
  state.jobsProcessed += jobs.length;

  // If there's a next page and we haven't hit limits, navigate to it
  // Skip navigation if no jobs were found (might be an error or empty page)
  if (hasNextPage && state.tabId && jobs.length > 0) {
    // Add a delay before navigating (human-like behavior + gives user time to interact)
    setTimeout(() => {
      // Double-check engine is still running before navigating
      if (engineState === 'RUNNING' && state.isActive && state.tabId) {
        console.log(`[Jobzippy] ${platform}: Sending NAVIGATE_NEXT_PAGE command`);
        chrome.tabs.sendMessage(state.tabId, { type: 'NAVIGATE_NEXT_PAGE' }).catch((err) => {
          console.error(`[Jobzippy] Error navigating ${platform} to next page:`, err);
        });
      } else {
        console.log(
          `[Jobzippy] ${platform}: Skipping navigation - engine state:`,
          engineState,
          'isActive:',
          state.isActive
        );
      }
    }, 3000); // Increased from 2000 to 3000ms
  } else if (jobs.length === 0) {
    console.log(`[Jobzippy] ${platform}: No jobs found on page, skipping navigation`);
  } else {
    // No more pages for this platform
    console.log(`[Jobzippy] ${platform}: No more pages, iteration complete`);
    state.isActive = false;
    state.hasNextPage = false;
  }

  broadcastEngineState();
}

// Handle page navigation completion
function handlePageNavigated(platform: 'LinkedIn' | 'Indeed') {
  const state = platformStates.get(platform);
  if (!state || !state.isActive || engineState !== 'RUNNING' || !state.tabId) return;

  // Wait a bit for page to load, then scrape again
  setTimeout(() => {
    if (engineState === 'RUNNING' && state.isActive && state.tabId) {
      chrome.tabs.sendMessage(state.tabId, { type: 'SCRAPE_JOBS' }).catch((err) => {
        console.error(`[Jobzippy] Error sending SCRAPE_JOBS to ${platform} after navigation:`, err);
      });
    }
  }, 3000);
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
    case 'AUTH_PROBE_ALL':
      // Probe active tabs for LinkedIn/Indeed to re-emit AUTH_STATE
      try {
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (!tab.id || !tab.url) continue;
            if (tab.url.includes('linkedin.com') || tab.url.includes('indeed.com')) {
              chrome.tabs.sendMessage(tab.id, { type: 'AUTH_PROBE' }).catch(() => {});
            }
          }
        });
      } catch {
        // ignore
      }
      sendResponse({ status: 'ok' });
      break;
    case 'START_AUTO_APPLY':
      startEngine();
      sendResponse({ status: 'success', state: engineState });
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
      // TODO: Fetch encrypted profile from IndexedDB
      sendResponse({ status: 'success', profile: null });
      break;

    case 'JOB_APPLIED':
      // TODO: Log application to Google Sheet
      console.log('[Jobzippy] Job applied:', message.data);
      sendResponse({ status: 'success' });
      break;

    case 'JOBS_SCRAPED': {
      const data = message.data as {
        platform: 'LinkedIn' | 'Indeed';
        jobs: Array<{
          id: string;
          title: string;
          company: string;
          location: string;
          url: string;
          platform: 'LinkedIn' | 'Indeed';
        }>;
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
        // Auto-resume after 8 seconds of inactivity
        setTimeout(() => {
          if (engineState === 'PAUSED') {
            console.log('[Jobzippy] Background auto-resuming engine after 8 seconds');
            engineState = 'RUNNING';
            engineStatus = 'Resumed';
            broadcastEngineState();
            // Continue scraping active platforms
            platformStates.forEach((state) => {
              if (state.isActive && state.tabId) {
                chrome.tabs.sendMessage(state.tabId, { type: 'SCRAPE_JOBS' }).catch(() => {});
              }
            });
          }
        }, 8000);
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
      setTimeout(() => {
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
      }, 1000);
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
      broadcastEngineState();
    }
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
