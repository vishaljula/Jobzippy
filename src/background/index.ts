/**
 * Background Service Worker
 * Handles extension lifecycle, messaging, and orchestration
 */

console.log('[Jobzippy] Background service worker initialized');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Jobzippy] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First time installation
    chrome.storage.local.set({
      version: chrome.runtime.getManifest().version,
      installedAt: new Date().toISOString(),
      onboardingComplete: false,
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

