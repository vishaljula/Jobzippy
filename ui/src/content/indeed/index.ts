/**
 * Indeed Content Script
 * Handles job search and apply automation on Indeed
 */

console.log('[Jobzippy] Indeed content script loaded');

// Check if we're on an Indeed jobs page
const isJobsPage = () => {
  return window.location.href.includes('indeed.com');
};

// Initialize content script
function init() {
  if (!isJobsPage()) {
    console.log('[Jobzippy] Not on Indeed page, skipping initialization');
    return;
  }

  console.log('[Jobzippy] Initializing Indeed automation');

  // Add visual indicator that extension is active (dev-only)
  if (import.meta.env.DEV) {
    addActiveIndicator();
  }

  // Notify side panel that Indeed is active
  chrome.runtime.sendMessage({ type: 'PAGE_ACTIVE', data: { platform: 'Indeed' } }).catch(() => {});

  // Report auth state heuristic
  try {
    const loggedIn = detectLoggedIn();
    chrome.runtime
      .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn } })
      .catch(() => {});
  } catch {
    // ignore
  }

  // Observe SPA route/content changes and re-emit AUTH_STATE on change
  setupAuthObservers();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'AUTH_PROBE':
        try {
          const loggedIn = detectLoggedIn();
          chrome.runtime
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn } })
            .catch(() => {});
          sendResponse({ status: 'ok' });
        } catch {
          sendResponse({ status: 'error' });
        }
        break;
      case 'START_AUTO_APPLY':
        console.log('[Jobzippy] Starting auto-apply on Indeed');
        // TODO: Implement auto-apply logic
        sendResponse({ status: 'started' });
        break;

      case 'STOP_AUTO_APPLY':
        console.log('[Jobzippy] Stopping auto-apply on Indeed');
        sendResponse({ status: 'stopped' });
        break;

      default:
        sendResponse({ status: 'unknown_command' });
    }
    return true;
  });
}

// Add a visual indicator that Jobzippy is active
function addActiveIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'jobzippy-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #0ea5e9 0%, #a855f7 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideIn 0.3s ease-out;
  `;

  indicator.innerHTML = `
    <div style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite;"></div>
    <span>Jobzippy Active</span>
  `;

  // Add animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(indicator);

  // Remove after 5 seconds
  setTimeout(() => {
    indicator.style.transition = 'opacity 0.3s ease-out';
    indicator.style.opacity = '0';
    setTimeout(() => indicator.remove(), 300);
  }, 5000);
}

// Helper function to find apply now jobs
function findApplyNowJobs(): HTMLElement[] {
  const jobs: HTMLElement[] = [];
  // TODO: Implement job scraping logic
  return jobs;
}

// Helper function to click Apply Now button
async function clickApplyNow(jobElement: HTMLElement): Promise<boolean> {
  // TODO: Implement Apply Now automation
  console.log('[Jobzippy] Clicking Apply Now for job:', jobElement);
  return false;
}

function detectLoggedIn(): boolean {
  const url = window.location.href;
  // Explicit login routes
  if (/\/account\/login|\/signin|auth/.test(url)) return false;
  // If we see a clear Profile menu or avatar, assume logged in
  if (
    document.querySelector(
      '#gnav-ProfileMenu, a[data-gnav-element-name="Profile"], button[id^="gnav-Profile"], [data-gnav-element-name="AccountMenu"]'
    )
  ) {
    return true;
  }
  // If we see clear sign-in CTA, assume not logged in
  if (
    document.querySelector(
      'a[data-gnav-element-name="SignIn"], a[href*="/account/login"], form[action*="login"]'
    )
  ) {
    return false;
  }
  // Conservative default: treat as not logged in unless we see profile evidence
  return false;
}

function setupAuthObservers() {
  let lastState: boolean | null = null;
  let timer: number | null = null;
  const debounceCheck = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      try {
        const state = detectLoggedIn();
        if (state !== lastState) {
          lastState = state;
          chrome.runtime
            .sendMessage({ type: 'AUTH_STATE', data: { platform: 'Indeed', loggedIn: state } })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    }, 400);
  };

  // Initial capture
  debounceCheck();

  // Observe DOM changes (nav bar/login widgets update without URL change)
  const obs = new MutationObserver(debounceCheck);
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // Hook history changes for SPA navigations
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const res = origPush.apply(history, args as any);
    debounceCheck();
    return res;
  } as typeof history.pushState;
  window.addEventListener('popstate', debounceCheck);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export { findApplyNowJobs, clickApplyNow };
