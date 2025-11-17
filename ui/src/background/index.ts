/**
 * Background Service Worker
 * Handles extension lifecycle, messaging, and orchestration
 */

console.log('[Jobzippy] Background service worker initialized');

// -----------------------------------------------------------------------------
// Lightweight Engine State (Story 1: Start/Stop lifecycle)
// -----------------------------------------------------------------------------
type EngineState = 'IDLE' | 'RUNNING';
let engineState: EngineState = 'IDLE';
let engineStatus: string = 'Idle';
let engineInterval: number | null = null;

function broadcastEngineState() {
  chrome.runtime
    .sendMessage({
      type: 'ENGINE_STATE',
      data: { state: engineState, status: engineStatus, ts: Date.now() },
    })
    .catch(() => {});
}

function startEngine() {
  if (engineState === 'RUNNING') return;
  engineState = 'RUNNING';
  engineStatus = 'Starting…';
  broadcastEngineState();
  // Placeholder heartbeat to prove lifecycle and status updates
  engineInterval = self.setInterval(() => {
    engineStatus = 'Running…';
    broadcastEngineState();
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
  broadcastEngineState();
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
  console.log('[Jobzippy] Message received:', message);

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
      (tab.url.includes('linkedin.com') || tab.url.includes('indeed.com'))
    ) {
      chrome.tabs.sendMessage(tabId, { type: 'AUTH_PROBE' }).catch(() => {});
    }
  } catch {
    // ignore
  }
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
